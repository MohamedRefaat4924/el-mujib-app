import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import {
  createAudioPlayer,
  setAudioModeAsync,
  AudioPlayer,
} from 'expo-audio';

// Global reference to the currently playing audio player
// This ensures only one audio message plays at a time
let currentlyPlayingId: string | null = null;
let currentlyPlayingPlayer: AudioPlayer | null = null;

interface InlineAudioPlayerProps {
  mediaUrl: string;
  messageId: string;
  isOutgoing: boolean;
}

export function InlineAudioPlayer({ mediaUrl, messageId, isOutgoing }: InlineAudioPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const playerRef = useRef<AudioPlayer | null>(null);
  const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);

  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }
      if (playerRef.current) {
        try {
          playerRef.current.pause();
          playerRef.current.release();
        } catch (e) {
          // ignore cleanup errors
        }
        if (currentlyPlayingId === messageId) {
          currentlyPlayingId = null;
          currentlyPlayingPlayer = null;
        }
        playerRef.current = null;
      }
    };
  }, [messageId]);

  const startProgressTracking = useCallback(() => {
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
    }
    progressIntervalRef.current = setInterval(() => {
      if (!mountedRef.current || !playerRef.current) {
        if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
        return;
      }
      try {
        const player = playerRef.current;
        const time = player.currentTime || 0;
        const dur = player.duration || 0;
        
        if (mountedRef.current) {
          setCurrentTime(time);
          if (dur > 0) setDuration(dur);
          
          // Check if playback finished
          if (dur > 0 && time >= dur - 0.1) {
            setIsPlaying(false);
            setCurrentTime(0);
            if (progressIntervalRef.current) {
              clearInterval(progressIntervalRef.current);
              progressIntervalRef.current = null;
            }
            if (currentlyPlayingId === messageId) {
              currentlyPlayingId = null;
              currentlyPlayingPlayer = null;
            }
          }
        }
      } catch (e) {
        // Player might be released
      }
    }, 250);
  }, [messageId]);

  const handlePlayPause = useCallback(async () => {
    try {
      // If currently playing, pause
      if (isPlaying && playerRef.current) {
        playerRef.current.pause();
        setIsPlaying(false);
        if (progressIntervalRef.current) {
          clearInterval(progressIntervalRef.current);
          progressIntervalRef.current = null;
        }
        if (currentlyPlayingId === messageId) {
          currentlyPlayingId = null;
          currentlyPlayingPlayer = null;
        }
        return;
      }

      // Stop any other currently playing audio
      if (currentlyPlayingPlayer && currentlyPlayingId !== messageId) {
        try {
          currentlyPlayingPlayer.pause();
        } catch (e) {
          // ignore
        }
        currentlyPlayingId = null;
        currentlyPlayingPlayer = null;
      }

      // Enable playback in silent mode
      await setAudioModeAsync({
        playsInSilentMode: true,
      });

      // Create player if not exists
      if (!playerRef.current) {
        setIsLoading(true);
        const player = createAudioPlayer(mediaUrl);
        playerRef.current = player;
        
        // Wait a bit for the player to load
        await new Promise(resolve => setTimeout(resolve, 500));
        
        if (!mountedRef.current) return;
        
        const dur = player.duration || 0;
        if (dur > 0) setDuration(dur);
        setIsLoading(false);
      }

      // Play
      playerRef.current.seekTo(currentTime > 0 && currentTime < (duration - 0.5) ? currentTime : 0);
      playerRef.current.play();
      setIsPlaying(true);
      currentlyPlayingId = messageId;
      currentlyPlayingPlayer = playerRef.current;
      
      startProgressTracking();
    } catch (e) {
      console.error('[AudioPlayer] Error:', e);
      setIsLoading(false);
      setIsPlaying(false);
    }
  }, [isPlaying, mediaUrl, messageId, currentTime, duration, startProgressTracking]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const progress = duration > 0 ? (currentTime / duration) : 0;
  const accentColor = isOutgoing ? '#089B21' : '#555';
  const barBgColor = isOutgoing ? 'rgba(8,155,33,0.2)' : 'rgba(0,0,0,0.1)';
  const barFillColor = isOutgoing ? '#089B21' : '#687076';

  return (
    <View style={styles.container}>
      {/* Play/Pause Button */}
      <TouchableOpacity
        style={styles.playBtn}
        onPress={handlePlayPause}
        activeOpacity={0.7}
      >
        {isLoading ? (
          <View style={[styles.loadingCircle, { borderColor: accentColor }]} />
        ) : (
          <MaterialIcons
            name={isPlaying ? 'pause-circle-filled' : 'play-circle-fill'}
            size={40}
            color={accentColor}
          />
        )}
      </TouchableOpacity>

      {/* Progress Bar and Time */}
      <View style={styles.progressArea}>
        {/* Waveform-style progress bar */}
        <View style={styles.waveformContainer}>
          {Array.from({ length: 30 }).map((_, i) => {
            const barProgress = i / 30;
            const isFilled = barProgress <= progress;
            // Generate pseudo-random heights based on index (deterministic)
            const seed = ((i * 7 + 3) * 13) % 17;
            const height = 4 + (seed / 17) * 16;
            return (
              <View
                key={i}
                style={[
                  styles.waveBar,
                  {
                    height,
                    backgroundColor: isFilled ? barFillColor : barBgColor,
                  },
                ]}
              />
            );
          })}
        </View>

        {/* Time display */}
        <View style={styles.timeRow}>
          <Text style={[styles.timeText, { color: isOutgoing ? '#687076' : '#9BA1A6' }]}>
            {isPlaying || currentTime > 0 ? formatTime(currentTime) : (duration > 0 ? formatTime(duration) : '0:00')}
          </Text>
          {duration > 0 && (isPlaying || currentTime > 0) && (
            <Text style={[styles.timeText, { color: isOutgoing ? '#687076' : '#9BA1A6' }]}>
              {formatTime(duration)}
            </Text>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minWidth: 220,
    paddingVertical: 2,
  },
  playBtn: {
    padding: 2,
  },
  loadingCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 3,
    borderTopColor: 'transparent',
  },
  progressArea: {
    flex: 1,
  },
  waveformContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 1.5,
    height: 24,
  },
  waveBar: {
    width: 3,
    borderRadius: 1.5,
  },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  timeText: {
    fontSize: 11,
  },
});
