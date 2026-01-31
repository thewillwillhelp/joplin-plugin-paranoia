import joplin from 'api';
import { UI } from './ui';
import { sync } from './core';

export async function registerSyncCommand() {
    const commandName = 'ParanoiaPartialSyncCommand';

    await joplin.commands.register({
        name: commandName,
        label: 'Merge synced folders',
        execute: async () => {
            await sync();
        },
    });
}
