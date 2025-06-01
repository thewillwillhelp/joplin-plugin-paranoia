import joplin from 'api';
import {
    registerClearScriptsOutputsButton,
    registerLoadDefaultsButton,
    registerPlayButton,
} from './register/register_buttons';

joplin.plugins.register({
    onStart: async function () {
        // eslint-disable-next-line no-console
        console.info('Hello world. Test plugin started!');

        registerPlayButton();
        // registerLoadDefaultsButton();
        registerClearScriptsOutputsButton();
    },
});
