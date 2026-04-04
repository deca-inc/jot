/**
 * Web shim for @react-navigation/native
 *
 * Provides stub useNavigation for posthog-react-native which optionally uses it.
 */

export function useNavigation() {
  return {
    navigate: () => {},
    goBack: () => {},
    dispatch: () => {},
    addListener: () => () => {},
  };
}

export function useRoute() {
  return { key: "", name: "", params: {} };
}

export function useNavigationState(_selector: unknown) {
  return null;
}
