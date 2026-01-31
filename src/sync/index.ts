import joplin from 'api';
import { diaflogs } from './ui';
import { sync } from './core';

export async function registerSyncCommand() {
    const commandName = 'ParanoiaPartialSyncCommand';

    await joplin.commands.register({
        name: commandName,
        label: 'Merge synced folders',
        execute: async () => {
            // await diaflogs.createLogDialog();
            await sync();
        },
    });
}
