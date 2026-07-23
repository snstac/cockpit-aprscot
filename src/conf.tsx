import { EnvVarDefinition } from '@snstac/cockpit-shared';

// Configuration schema for /etc/default/aprscot (APRSCOT: APRS to TAK Gateway).
// Two input transports: a local KISS TNC (e.g. Dire Wolf, over-the-air RF) when
// KISS_HOST is set, otherwise the APRS-IS internet feed. Output is CoT to COT_URL.
export const CONF_PARAMS: Record<string, EnvVarDefinition> = {

    COT_URL: {
        type: 'url',
        description: 'URL of the CoT destination, typically Mesh SA or a TAK Server',
        defaultValue: 'udp+wo://239.2.3.1:6969',
        validation: /^(udp\+wo|http|https|udp|tcp|tls|file|log|tcp\+wo|udp\+broadcast):\/\/[^\s]+$/,
        requiresQuoting: false,
        required: true,
    },

    KISS_HOST: {
        type: 'string',
        description: '(RF) Local KISS TNC host (e.g. Dire Wolf). Set to read over-the-air APRS instead of APRS-IS.',
        defaultValue: '',
        validation: /^([\w.-]+)?$/,
        requiresQuoting: false,
        required: false,
    },

    KISS_PORT: {
        type: 'number',
        description: '(RF) KISS-over-TCP port of the local TNC (Dire Wolf KISSPORT)',
        defaultValue: '8001',
        validation: /^\d{1,5}$/,
        range: [1, 65535],
        required: false,
    },

    APRSIS_CALLSIGN: {
        type: 'string',
        description: '(APRS-IS) Login callsign',
        defaultValue: 'SUNSET',
        validation: /^[A-Za-z0-9-]{1,9}$/,
        requiresQuoting: false,
        required: false,
    },

    APRSIS_PASSCODE: {
        type: 'string',
        description: '(APRS-IS) Passcode ("password"); -1 for receive-only',
        defaultValue: '-1',
        validation: /^-?\d+$/,
        requiresQuoting: false,
        required: false,
    },

    APRSIS_FILTER: {
        type: 'string',
        description: '(APRS-IS) Server-side filter, e.g. m/50 (see aprs-is.net javAPRSFilter)',
        defaultValue: 'm/50',
        validation: /^.*$/,
        requiresQuoting: false,
        required: false,
    },

    APRSIS_HOST: {
        type: 'string',
        description: '(APRS-IS) Server hostname',
        defaultValue: 'rotate.aprs.net',
        validation: /^[\w.-]+$/,
        requiresQuoting: false,
        required: false,
    },

    APRSIS_PORT: {
        type: 'number',
        description: '(APRS-IS) Server port',
        defaultValue: '14580',
        validation: /^\d{1,5}$/,
        range: [1, 65535],
        required: false,
    },

    COT_STALE: {
        type: 'number',
        description: 'CoT stale period ("timeout"), in seconds',
        defaultValue: '3600',
        validation: /^\d+$/,
        range: [1, 604800],
        required: false,
    },

    COT_TYPE: {
        type: 'string',
        description: 'Override CoT event type ("marker type")',
        defaultValue: 'a-f-G-I-U-T-r',
        validation: /^[a-z](-[A-Za-z0-9]+)+$/,
        requiresQuoting: false,
        required: false,
    },

    SENSOR_LAT: {
        type: 'string',
        description: 'Sensor beacon latitude (decimal degrees); gpsd overrides when available',
        defaultValue: '',
        validation: /^-?\d{1,2}(\.\d+)?$/,
        requiresQuoting: false,
        required: false,
    },

    SENSOR_LON: {
        type: 'string',
        description: 'Sensor beacon longitude (decimal degrees); gpsd overrides when available',
        defaultValue: '',
        validation: /^-?\d{1,3}(\.\d+)?$/,
        requiresQuoting: false,
        required: false,
    },

    TAK_PROTO: {
        type: 'enum',
        description: 'TAK protocol for CoT output (0=XML, 1=Proto Stream, 2=Proto Mesh)',
        defaultValue: '0',
        options: ['0', '1', '2'],
        validation: /^[012]$/,
        required: false,
    },

    PYTAK_TLS_CLIENT_CERT: {
        type: 'path',
        description: '(TLS) Path to the PEM client certificate (for tls:// TAK Server destinations)',
        defaultValue: '',
        validation: /^(\/[^\s]*)?$/,
        requiresQuoting: false,
        required: false,
    },

    PYTAK_TLS_CLIENT_KEY: {
        type: 'path',
        description: '(TLS) Path to the PEM client private key, if separate from the certificate',
        defaultValue: '',
        validation: /^(\/[^\s]*)?$/,
        requiresQuoting: false,
        required: false,
    },

    DEBUG: {
        type: 'boolean',
        description: 'Enable debug-level logging',
        defaultValue: 'false',
        validation: /^(true|false|0|1)?$/i,
        required: false,
    },
};
