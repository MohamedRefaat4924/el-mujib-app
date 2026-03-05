/**
 * Cross-Platform Alert
 * 
 * React Native's Alert.alert() doesn't work reliably on web browsers.
 * This utility provides a cross-platform solution:
 * - Native (iOS/Android): Uses the standard Alert.alert()
 * - Web: Uses window.confirm() / window.alert() for reliable browser dialogs
 */

import { Alert, Platform } from 'react-native';

interface AlertButton {
  text: string;
  onPress?: () => void;
  style?: 'default' | 'cancel' | 'destructive';
}

/**
 * Show a cross-platform alert dialog.
 * 
 * On web, it maps to browser-native dialogs:
 * - 1 button: window.alert()
 * - 2 buttons: window.confirm() (Cancel = first, OK = second)
 * - 3+ buttons: Sequential window.confirm() calls
 */
export function crossPlatformAlert(
  title: string,
  message?: string,
  buttons?: AlertButton[]
) {
  if (Platform.OS !== 'web') {
    // Native: use standard Alert.alert
    Alert.alert(title, message, buttons);
    return;
  }

  // Web: use browser dialogs
  const fullMessage = message ? `${title}\n\n${message}` : title;

  if (!buttons || buttons.length === 0) {
    window.alert(fullMessage);
    return;
  }

  if (buttons.length === 1) {
    window.alert(fullMessage);
    buttons[0].onPress?.();
    return;
  }

  if (buttons.length === 2) {
    // Simple confirm: first button = Cancel, second button = OK
    const cancelBtn = buttons.find(b => b.style === 'cancel' || b.style === 'destructive') || buttons[0];
    const okBtn = buttons.find(b => b !== cancelBtn) || buttons[1];
    
    const result = window.confirm(fullMessage);
    if (result) {
      okBtn.onPress?.();
    } else {
      cancelBtn.onPress?.();
    }
    return;
  }

  // 3+ buttons: Show a numbered choice dialog
  // For the voice recording case: "Send Now", "Save for Later", "Discard"
  const buttonLabels = buttons.map((b, i) => `${i + 1}. ${b.text}`).join('\n');
  const promptMessage = `${fullMessage}\n\nChoose an option:\n${buttonLabels}\n\n(Enter the number)`;
  
  const choice = window.prompt(promptMessage, '1');
  
  if (choice === null) {
    // User pressed Cancel in prompt - find destructive/cancel button
    const cancelBtn = buttons.find(b => b.style === 'destructive' || b.style === 'cancel');
    cancelBtn?.onPress?.();
    return;
  }

  const index = parseInt(choice, 10) - 1;
  if (index >= 0 && index < buttons.length) {
    buttons[index].onPress?.();
  } else {
    // Invalid choice, default to first button
    buttons[0].onPress?.();
  }
}
