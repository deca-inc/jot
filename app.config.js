module.exports = ({ config }) => {
  const isDev = process.env.EXPO_PUBLIC_APP_VARIANT !== 'production';

  return {
    ...config,
    name: isDev ? 'Jot (Dev)' : 'Jot',
    owner: 'beta-zeta-inc',
    slug: 'jot',
    version: '1.0.0',
    orientation: 'portrait',
    icon: isDev ? './assets/icon-dev.png' : './assets/icon.png',
    userInterfaceStyle: 'light',
    newArchEnabled: true,
    splash: {
      image: './assets/splash-icon.png',
      resizeMode: 'contain',
      backgroundColor: '#000000'
    },
    ios: {
      supportsTablet: true,
      bundleIdentifier: isDev ? 'com.betazeta.jot.dev' : 'com.betazeta.jot',
      infoPlist: {
        UIBackgroundModes: ['fetch', 'processing', 'remote-notification'],
        BGTaskSchedulerPermittedIdentifiers: [
          'com.betazeta.jot.background-generation',
          'com.betazeta.jot.background-download'
        ],
        ITSAppUsesNonExemptEncryption: false
      }
    },
    android: {
      adaptiveIcon: {
        foregroundImage: isDev ? './assets/adaptive-icon-dev.png' : './assets/adaptive-icon.png',
        backgroundColor: '#000000'
      },
      edgeToEdgeEnabled: true,
      predictiveBackGestureEnabled: false,
      package: isDev ? 'com.dotdotdot.jot.dev' : 'com.dotdotdot.jot',
      permissions: [
        'RECEIVE_BOOT_COMPLETED',
        'WAKE_LOCK',
        'FOREGROUND_SERVICE',
        'INTERNET',
        'ACCESS_NETWORK_STATE',
        'READ_EXTERNAL_STORAGE',
        'WRITE_EXTERNAL_STORAGE'
      ],
      requestLegacyExternalStorage: true
    },
    web: {
      favicon: './assets/favicon.png'
    },
    plugins: [
      [
        'expo-sqlite',
        {
          useSQLCipher: true
        }
      ],
      'expo-secure-store',
      [
        'expo-build-properties',
        {
          android: {
            packagingOptions: {
              pickFirst: ['**/libcrypto.so', '**/libssl.so']
            },
            manifestPlaceholders: {
              'android.max_page_size': '4096'
            }
          }
        }
      ]
    ],
    extra: {
      eas: {
        projectId: '0218f474-abc5-4575-ab99-0fa81a34e435'
      }
    }
  };
};
