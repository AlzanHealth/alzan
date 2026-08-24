import React from 'react';
import { Bot, Sparkles } from 'lucide-react-native';
import { Text, View } from 'react-native';

export type AiProviderLogoProps = {
  provider: 'chatgpt' | 'gemini' | 'claude';
  size?: number;
};

export const AiProviderLogo = ({ provider, size = 44 }: AiProviderLogoProps) => {
  const iconSize = Math.round(size * 0.48);

  if (provider === 'chatgpt') {
    return (
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#171717',
        }}
      >
        <Bot size={iconSize} color="#FFFFFF" strokeWidth={1.8} />
      </View>
    );
  }

  if (provider === 'gemini') {
    return (
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#E8F0FE',
        }}
      >
        <Sparkles size={iconSize} color="#4285F4" strokeWidth={2.4} />
      </View>
    );
  }

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#FFF1E8',
      }}
    >
      <Text style={{ color: '#D97745', fontSize: iconSize, fontWeight: '800' }}>A</Text>
    </View>
  );
};
