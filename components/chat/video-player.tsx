import React, { useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Dimensions, Platform, Linking } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Image as ExpoImage } from 'expo-image';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEvent } from 'expo';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const MAX_BUBBLE_WIDTH = SCREEN_WIDTH * 0.78;
const VIDEO_WIDTH = MAX_BUBBLE_WIDTH - 24;
const VIDEO_HEIGHT = 200;

interface InlineVideoPlayerProps {
  mediaUrl: string;
  messageId: string;
  isOutgoing: boolean;
  caption?: string;
}

/**
 * Inline video player for chat message bubbles.
 * Shows a thumbnail with play overlay initially.
 * On tap, switches to the native VideoView with controls.
 * Supports fullscreen playback.
 */
export function InlineVideoPlayer({ mediaUrl, messageId, isOutgoing, caption }: InlineVideoPlayerProps) {
  const [showPlayer, setShowPlayer] = useState(false);

  // Create the video player (lazy - only loads when source is provided)
  const player = useVideoPlayer(showPlayer ? mediaUrl : null, (p) => {
    p.loop = false;
  });

  const { isPlaying } = useEvent(player, 'playingChange', { isPlaying: player.playing });

  const handleTapToPlay = useCallback(() => {
    setShowPlayer(true);
    // Small delay to let VideoView mount, then play
    setTimeout(() => {
      try {
        player.play();
      } catch (e) {
        // Player might not be ready yet
      }
    }, 300);
  }, [player]);

  const handleOpenExternal = useCallback(() => {
    if (mediaUrl) {
      Linking.openURL(mediaUrl);
    }
  }, [mediaUrl]);

  if (!mediaUrl) {
    return (
      <View style={styles.placeholder}>
        <MaterialIcons name="videocam-off" size={32} color="#9BA1A6" />
        <Text style={styles.placeholderText}>Video unavailable</Text>
      </View>
    );
  }

  return (
    <View>
      {showPlayer ? (
        // Active video player
        <View style={styles.playerContainer}>
          {Platform.OS === 'web' ? (
            // On web, use a simple video element approach via Linking
            <TouchableOpacity
              style={styles.thumbnailContainer}
              onPress={handleOpenExternal}
              activeOpacity={0.8}
            >
              <View style={styles.playOverlay}>
                <View style={styles.playButton}>
                  <MaterialIcons name="open-in-new" size={28} color="#fff" />
                </View>
                <Text style={styles.openExternalText}>Open Video</Text>
              </View>
            </TouchableOpacity>
          ) : (
            // On native, use expo-video's VideoView
            <View style={styles.videoViewWrapper}>
              <VideoView
                player={player}
                style={styles.videoView}
                contentFit="cover"
                nativeControls={true}
              />
              {/* Overlay controls */}
              <View style={styles.controlsOverlay}>
                <TouchableOpacity
                  style={styles.fullscreenBtn}
                  onPress={handleOpenExternal}
                  activeOpacity={0.7}
                >
                  <MaterialIcons name="open-in-new" size={18} color="#fff" />
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      ) : (
        // Thumbnail with play button overlay
        <TouchableOpacity
          style={styles.thumbnailContainer}
          onPress={handleTapToPlay}
          activeOpacity={0.8}
        >
          {/* Use video URL as thumbnail - ExpoImage can extract frames from some video URLs */}
          <View style={styles.thumbnailBg}>
            <MaterialIcons name="videocam" size={40} color="rgba(255,255,255,0.6)" />
          </View>
          <View style={styles.playOverlay}>
            <View style={[styles.playButton, { backgroundColor: isOutgoing ? '#1A6B3C' : '#4A6CF7' }]}>
              <MaterialIcons name="play-arrow" size={32} color="#fff" />
            </View>
            <Text style={styles.tapToPlayText}>Tap to play</Text>
          </View>
        </TouchableOpacity>
      )}
      {caption ? (
        <Text style={[styles.captionText, isOutgoing && styles.outgoingCaption]}>{caption}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  placeholder: {
    width: VIDEO_WIDTH,
    height: 120,
    borderRadius: 12,
    backgroundColor: '#F0F0F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderText: {
    color: '#9BA1A6',
    fontSize: 12,
    marginTop: 4,
  },
  playerContainer: {
    width: VIDEO_WIDTH,
    height: VIDEO_HEIGHT,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  videoViewWrapper: {
    width: '100%',
    height: '100%',
    position: 'relative',
  },
  videoView: {
    width: '100%',
    height: '100%',
  },
  controlsOverlay: {
    position: 'absolute',
    top: 8,
    right: 8,
    flexDirection: 'row',
    gap: 8,
  },
  fullscreenBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbnailContainer: {
    width: VIDEO_WIDTH,
    height: VIDEO_HEIGHT,
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
  },
  thumbnailBg: {
    width: '100%',
    height: '100%',
    backgroundColor: '#2C2C2E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  playButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(26,107,60,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 5,
  },
  tapToPlayText: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 12,
    fontWeight: '500',
    marginTop: 6,
  },
  openExternalText: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 13,
    fontWeight: '600',
    marginTop: 6,
  },
  captionText: {
    fontSize: 14,
    lineHeight: 20,
    color: '#1B1B23',
    marginTop: 6,
    paddingHorizontal: 2,
  },
  outgoingCaption: {
    color: '#1B1B23',
  },
});
