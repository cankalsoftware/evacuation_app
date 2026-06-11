import React, { useState, useEffect } from 'react';
import { Animated, Text, StyleSheet, DeviceEventEmitter, Platform } from 'react-native';

export const showToast = (message: string, type: 'success' | 'error' = 'success') => {
  DeviceEventEmitter.emit('SHOW_TOAST', { message, type });
};

export default function Toast() {
  const [message, setMessage] = useState('');
  const [type, setType] = useState('success');
  const [visible, setVisible] = useState(false);
  const opacity = useState(new Animated.Value(0))[0];

  useEffect(() => {
    const listener = DeviceEventEmitter.addListener('SHOW_TOAST', (data) => {
      setMessage(data.message);
      setType(data.type);
      setVisible(true);
      opacity.setValue(0);

      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 300, useNativeDriver: Platform.OS !== 'web' }),
        Animated.delay(2000),
        Animated.timing(opacity, { toValue: 0, duration: 300, useNativeDriver: Platform.OS !== 'web' })
      ]).start(() => {
        setVisible(false);
      });
    });

    return () => {
      listener.remove();
    };
  }, [opacity]);

  if (!visible) return null;

  return (
    <Animated.View style={[styles.container, { opacity }, type === 'error' ? styles.error : styles.success]}>
      <Text style={styles.text}>{message}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: Platform.OS === 'web' ? 20 : 60,
    alignSelf: 'center',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 30,
    zIndex: 9999,
    elevation: 10,
    ...(Platform.OS === 'web' 
      ? { filter: 'drop-shadow(0px 4px 5px rgba(0,0,0,0.3))' } as any 
      : {
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.3,
          shadowRadius: 5,
        })
  },
  success: {
    backgroundColor: '#10b981', // Emerald 500
  },
  error: {
    backgroundColor: '#ef4444', // Red 500
  },
  text: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 16,
    textAlign: 'center'
  }
});
