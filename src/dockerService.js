import Docker from 'dockerode';

const docker = new Docker();
const IMAGE = 'node:22-alpine';

export async function ensureImagePulled() {
    const images = await docker.listImages({ filters: { reference: [IMAGE] } });
    if (images.length > 0) {
        return;
    }
    console.log(`Pulling ${IMAGE}, this may take a moment...`);
    const stream = await docker.pull(IMAGE);
    await new Promise((resolve, reject) => {
        docker.modem.followProgress(stream, (err, res) => (err ? reject(err) : resolve(res)));
    });
    console.log(`Pulled ${IMAGE}`);
}

export async function createSession() {
    const container = await docker.createContainer({
        Image: IMAGE,
        Cmd: ['/bin/sh'],
        Tty: true,
        OpenStdin: true,
        StdinOnce: false,
        HostConfig: {
            AutoRemove: true,
            Memory: 256 * 1024 * 1024,
            NanoCpus: 500_000_000,
        },
    });
    await container.start();
    return container.id;
}

export async function destroySession(containerId) {
    const container = docker.getContainer(containerId);
    try {
        await container.stop({ t: 1 });
    } catch (err) {
        // Container may have already exited; that's fine.
    }
}

export function getContainer(containerId) {
    return docker.getContainer(containerId);
}
