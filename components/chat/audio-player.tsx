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
    }, 200);
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

  // Fresh modern color scheme - different from Flutter's WhatsApp-green look
  const playBtnBg = isOutgoing ? '#1A6B3C' : '#4A6CF7';
  const barFilledColor = isOutgoing ? '#1A6B3C' : '#4A6CF7';
  const barEmptyColor = isOutgoing ? 'rgba(26,107,60,0.2)' : 'rgba(74,108,247,0.15)';
  const timeColor = isOutgoing ? 'rgba(0,0,0,0.5)' : 'rgba(0,0,0,0.4)';

  return (
    <View style={styles.container}>
      {/* Play/Pause Button - circular with solid background */}
      <TouchableOpacity
        style={[styles.playBtn, { backgroundColor: playBtnBg }]}
        onPress={handlePlayPause}
        activeOpacity={0.7}
      >
        {isLoading ? (
          <View style={styles.loadingDots}>
            <View style={[styles.dot, { backgroundColor: '#fff' }]} />
            <View style={[styles.dot, { backgroundColor: 'rgba(255,255,255,0.6)' }]} />
            <View style={[styles.dot, { backgroundColor: 'rgba(255,255,255,0.3)' }]} />
          </View>
        ) : (
          <MaterialIcons
            name={isPlaying ? 'pause' : 'play-arrow'}
            size={22}
            color="#FFFFFF"
          />
        )}
      </TouchableOpacity>

      {/* Progress Area */}
      <View style={styles.progressArea}>
        {/* Smooth rounded progress bar */}
        <View style={[styles.progressTrack, { backgroundColor: barEmptyColor }]}>
          <View
            style={[
              styles.progressFill,
              {
                backgroundColor: barFilledColor,
                width: `${Math.min(progress * 100, 100)}%`,
              },
            ]}
          />
          {/* Thumb indicator */}
          {(isPlaying || currentTime > 0) && (
            <View
              style={[
                styles.progressThumb,
                {
                  backgroundColor: barFilledColor,
                  left: `${Math.min(progress * 100, 100)}%`,
                },
              ]}
            />
          )}
        </View>

        {/* Time display */}
        <View style={styles.timeRow}>
          <Text style={[styles.timeText, { color: timeColor }]}>
            {isPlaying || currentTime > 0 ? formatTime(currentTime) : '0:00'}
          </Text>
          <Text style={[styles.timeText, { color: timeColor }]}>
            {duration > 0 ? formatTime(duration) : '--:--'}
          </Text>
        </View>
      </View>

      {/* Microphone icon */}
      <View style={styles.micIcon}>
        <MaterialIcons
          name="mic"
          size={16}
          color={isOutgoing ? 'rgba(26,107,60,0.5)' : 'rgba(74,108,247,0.4)'}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minWidth: 230,
    paddingVertical: 4,
  },
  playBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  loadingDots: {
    flexDirection: 'row',
    gap: 3,
    alignItems: 'center',
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  progressArea: {
    flex: 1,
  },
  progressTrack: {
    height: 4,
    borderRadius: 2,
    overflow: 'visible',
    position: 'relative',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
  },
  progressThumb: {
    position: 'absolute',
    top: -4,
    width: 12,
    height: 12,
    borderRadius: 6,
    marginLeft: -6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  timeText: {
    fontSize: 11,
    fontWeight: '500',
  },
  micIcon: {
    marginLeft: -2,
  },
});
