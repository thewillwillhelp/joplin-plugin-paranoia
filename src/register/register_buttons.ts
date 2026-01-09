import joplin from 'api';
import { ToolbarButtonLocation } from 'api/types';
import {
    clearScriptsOutputInNote,
    loadDefaultPluginScript,
    safePlayScriptsInNote,
} from '../scripts_in_notes/scripts_in_notes';

export async function registerPlayButton() {
    const commandName = 'ParanoiaPlayCommand';
    const buttonId = 'ParanoiaPlayButton';

    // Register the command that will be executed when the button is clicked
    await joplin.commands.register({
        name: commandName,
        label: 'Play Scripts', // This label will be used as a tooltip for the button
        iconName: 'fas fa-play', // Using 'fa-play' icon which shows a ">".
        execute: async () => {
            console.info('Running scripts in the note');

            await safePlayScriptsInNote();
        },
    });

    // Create the toolbar button in the editor's toolbar
    await joplin.views.toolbarButtons.create(
        buttonId,
        commandName,
        ToolbarButtonLocation.EditorToolbar // Places the button in the toolbar above the Markdown editor
    );
}

export async function registerLoadDefaultsButton() {
    const commandName = 'ParanoiaLoadDefaultsCommand';
    const buttonId = 'ParanoiaLoadDefaultsButton';

    // Register the command that will be executed when the button is clicked
    await joplin.commands.register({
        name: commandName,
        label: 'Load defaults', // This label will be used as a tooltip for the button
        iconName: 'fas fa-cog', // Using 'fa-cog' icon which shows gears.
        execute: async () => {
            console.info('P button clicked! Fetching notebooks...');
            // Example action: Show a message box
            // await joplin.views.dialogs.showMessageBox(
            //     'P button was pressed!'
            // );

            loadDefaultPluginScript();
        },
    });

    // Create the toolbar button in the editor's toolbar
    await joplin.views.toolbarButtons.create(
        buttonId,
        commandName,
        ToolbarButtonLocation.EditorToolbar // Places the button in the toolbar above the Markdown editor
    );
}

export async function registerClearScriptsOutputsButton() {
    const commandName = 'ParanoiaClearScriptsOutputsCommand';
    const buttonId = 'ParanoiaClearScriptsOutputsButton';

    // Register the command that will be executed when the button is clicked
    await joplin.commands.register({
        name: commandName,
        label: 'Clear Scripts Outputs', // This label will be used as a tooltip for the button
        iconName: 'fas fa-eraser', // Using 'fa-eraser' icon which shows an eraser.
        execute: async () => {
            console.info('Clearing scripts outputs');

            clearScriptsOutputInNote();
        },
    });

    // Create the toolbar button in the editor's toolbar
    await joplin.views.toolbarButtons.create(
        buttonId,
        commandName,
        ToolbarButtonLocation.EditorToolbar // Places the button in the toolbar above the Markdown editor
    );
}

export async function registerStrikethroughButton() {
    const commandName = 'ParanoiaStrikethroughCommand';
    const buttonId = 'ParanoiaStrikethroughButton';

    await joplin.commands.register({
        name: commandName,
        label: 'Wrap selection with ~~',
        iconName: 'fas fa-strikethrough',
        execute: async () => {
            const selected = await joplin.commands.execute('selectedText');

            if (selected && selected.length > 0) {
                // Wrap selection
                await joplin.commands.execute('insertText', `~~${selected}~~`);
            } else {
                // No selection → insert two tildes and move cursor between them
                await joplin.commands.execute('insertText', `~~~~`);
                await joplin.commands.execute('editor.execCommand', {
                    name: 'goCharLeft',
                });
                await joplin.commands.execute('editor.execCommand', {
                    name: 'goCharLeft',
                });
            }
        },
    });

    await joplin.views.toolbarButtons.create(
        buttonId,
        commandName,
        ToolbarButtonLocation.EditorToolbar
    );
}
