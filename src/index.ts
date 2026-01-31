import joplin from 'api';
import {
    registerClearScriptsOutputsButton,
    registerLoadDefaultsButton,
    registerPlayButton,
    registerStrikethroughButton,
} from './register/register_buttons';
import { SettingItemType } from 'api/types';
import { registerSyncCommand } from './sync';

async function registerSettings() {
    await joplin.settings.registerSection('paranoiaPluginSection', {
        label: 'Paranoia',
        iconName: 'fas fa-vector-square',
    });

    await joplin.settings.registerSettings({
        enableStrikethroughButton: {
            section: 'paranoiaPluginSection',
            value: true,
            type: SettingItemType.Bool,
            public: true,
            label: 'Enable Strikethrough on Toolbar',
            description: undefined,
        },
    });
}

async function getSettingsValues() {
    try {
        const values = await joplin.settings.values([
            'enableStrikethroughButton',
        ]);
        console.info('Settings values:', values);

        return values['enableStrikethroughButton'];
    } catch (error) {
        console.error('Error getting settings values:', error);
    }
}

joplin.plugins.register({
    onStart: async function () {
        await registerSettings();
        await registerSyncCommand();

        const isStrikethroughButtonEnabled = await getSettingsValues();
        console.info(
            'Loaded value from settings:',
            isStrikethroughButtonEnabled
        );

        // eslint-disable-next-line no-console
        console.info('Hello world. Test plugin started!');

        if (isStrikethroughButtonEnabled) {
            registerStrikethroughButton();
        }
        registerPlayButton();
        // registerLoadDefaultsButton();
        registerClearScriptsOutputsButton();
    },
});
