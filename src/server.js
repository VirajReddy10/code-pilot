import express from 'express';
import { WebSocketServer } from 'ws';
import { createServer } from 'node:http';
import { ensureImagePulled, createSession, getContainer, destroySession } from './dockerService.js';

const app = express();
app.use(express.static('public'));
app.use('/node_modules', express.static('node_modules'));

const httpServer = createServer(app);
const wss = new WebSocketServer({ server: httpServer });

const activeSessions = new Set();

let shuttingDown = false;

async function shutdown() {
    if (shuttingDown) {
        return;
    }
    shuttingDown = true;
    console.log(`Shutting down, cleaning up ${activeSessions.size} active session(s)...`);
    await Promise.all([...activeSessions].map((id) => destroySession(id)));
    process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
wss.on('connection', async (ws) => {
    console.log('Client connected, creating session...');
    let sessionId;

    try {
        await ensureImagePulled();
        sessionId = await createSession();
        activeSessions.add(sessionId);
        console.log(`Session ${sessionId.slice(0, 12)} ready`);
    } catch (err) {
        console.error('Failed to start session:', err.message);
        ws.close();
        return;
    }

    const container = getContainer(sessionId);
    const exec = await container.exec({
        Cmd: ['/bin/sh'],
        AttachStdin: true,
        AttachStdout: true,
        AttachStderr: true,
        Tty: true,
    });

    const stream = await exec.start({ hijack: true, stdin: true });

    stream.on('data', (chunk) => {
        ws.send(chunk);
    });

    ws.on('message', (data) => {
        stream.write(data);
    });

    ws.on('close', async () => {
        console.log(`Client disconnected, destroying session ${sessionId.slice(0, 12)}`);
        stream.end();
        await destroySession(sessionId);
        activeSessions.delete(sessionId);
    });
});

const PORT = 3000;
httpServer.listen(PORT, () => {
    console.log(`Code-Pilot server listening on http://localhost:${PORT}`);
});
