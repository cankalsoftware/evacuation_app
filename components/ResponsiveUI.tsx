import React from "react";
import { Text as RNText, TouchableOpacity as RNTouchableOpacity, TextInput as RNTextInput, useWindowDimensions, TextProps, TouchableOpacityProps, TextInputProps } from "react-native";
import { MaterialCommunityIcons as OriginalIcon } from "@expo/vector-icons";

export const Text = React.forwardRef<RNText, TextProps & { className?: string }>((props, ref) => {
  const { width } = useWindowDimensions();
  const fontScale = Math.min(Math.max(width / 400, 1), 1.6);
  let baseSize = 14;
  if (props.className) {
    if (props.className.includes('text-[10px]')) baseSize = 10;
    else if (props.className.includes('text-xs')) baseSize = 12;
    else if (props.className.includes('text-sm')) baseSize = 14;
    else if (props.className.includes('text-base')) baseSize = 16;
    else if (props.className.includes('text-lg')) baseSize = 18;
    else if (props.className.includes('text-xl')) baseSize = 20;
    else if (props.className.includes('text-2xl')) baseSize = 24;
    else if (props.className.includes('text-3xl')) baseSize = 30;
    else if (props.className.includes('text-4xl')) baseSize = 36;
  }
  return <RNText ref={ref} {...props} style={[{ fontSize: baseSize * fontScale }, props.style]} />;
});

export const TouchableOpacity = React.forwardRef<React.ElementRef<typeof RNTouchableOpacity>, TouchableOpacityProps & { className?: string }>((props, ref) => {
  const { width } = useWindowDimensions();
  const scale = Math.min(Math.max(width / 400, 1), 1.6);
  let p, px, py;
  if (props.className) {
    if (props.className.includes('p-1')) p = 4;
    if (props.className.includes('p-2')) p = 8;
    if (props.className.includes('p-3')) p = 12;
    if (props.className.includes('p-4')) p = 16;
    
    if (props.className.includes('px-2')) px = 8;
    if (props.className.includes('px-3')) px = 12;
    if (props.className.includes('px-4')) px = 16;
    if (props.className.includes('px-6')) px = 24;
    if (props.className.includes('px-8')) px = 32;
    
    if (props.className.includes('py-2')) py = 8;
    if (props.className.includes('py-3')) py = 12;
    if (props.className.includes('py-4')) py = 16;
  }
  const dynamicStyle: any = {};
  if (p) dynamicStyle.padding = p * scale;
  if (px) { dynamicStyle.paddingLeft = px * scale; dynamicStyle.paddingRight = px * scale; }
  if (py) { dynamicStyle.paddingTop = py * scale; dynamicStyle.paddingBottom = py * scale; }
  
  return <RNTouchableOpacity ref={ref} {...props} style={[dynamicStyle, props.style]} />;
});

export const TextInput = React.forwardRef<RNTextInput, TextInputProps & { className?: string }>((props, ref) => {
  const { width } = useWindowDimensions();
  const fontScale = Math.min(Math.max(width / 400, 1), 1.6);
  let p = 12;
  if (props.className && props.className.includes('p-4')) p = 16;
  return <RNTextInput ref={ref} {...props} style={[{ fontSize: 16 * fontScale, padding: p * fontScale }, props.style]} />;
});

export const MaterialCommunityIcons = (props: React.ComponentProps<typeof OriginalIcon>) => {
  const { width } = useWindowDimensions();
  const scale = Math.min(Math.max(width / 400, 1), 1.6);
  return <OriginalIcon {...props} size={((props.size as number) || 24) * scale} />;
};
