import React, { useRef, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  FlatList,
  Dimensions,
  StyleSheet,
  Platform,
  Share,
  StatusBar,
} from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChatMessage } from '@/lib/types';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface ImageGalleryProps {
  visible: boolean;
  initialImageUrl: string;
  messages: ChatMessage[];
  onClose: () => void;
}

/**
 * Full-screen image gallery viewer.
 * Opens on the tapped image and allows horizontal swiping to browse
 * all images in the conversation.
 */
export function ImageGallery({
  visible,
  initialImageUrl,
  messages,
  onClose,
}: ImageGalleryProps) {
  const insets = useSafeAreaInsets();
  const flatListRef = useRef<FlatList>(null);
  const [currentIndex, setCurrentIndex] = useState(0);

  // Collect all image URLs from messages (most recent first since chat is inverted)
  const imageItems = useMemo(() => {
    const items: { url: string; caption?: string; time?: string; messageId: string }[] = [];
    // Messages are in reverse order (newest first), so iterate in reverse to get chronological
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      const mediaUrl = msg.__data?.media_url;
      if (msg.message_type === 'image' && mediaUrl) {
        items.push({
          url: mediaUrl,
          caption: msg.__data?.caption || msg.formatted_message || undefined,
          time: msg.formatted_message_time || '',
          messageId: msg._uid,
        });
      }
      // Also collect images from template messages
      if (msg.template_message) {
        const imgMatch = msg.template_message.match(/<img[^>]+src=["']([^"']+)["']/i);
        if (imgMatch) {
          items.push({
            url: imgMatch[1],
            caption: msg.formatted_message || undefined,
            time: msg.formatted_message_time || '',
            messageId: msg._uid,
          });
        }
      }
    }
    return items;
  }, [messages]);

  // Find the initial index based on the tapped image URL
  const initialIndex = useMemo(() => {
    const idx = imageItems.findIndex((item) => item.url === initialImageUrl);
    return idx >= 0 ? idx : 0;
  }, [imageItems, initialImageUrl]);

  // When modal becomes visible, scroll to the initial image
  const onLayout = useCallback(() => {
    if (flatListRef.current && imageItems.length > 0) {
      setTimeout(() => {
        flatListRef.current?.scrollToIndex({
          index: initialIndex,
          animated: false,
        });
        setCurrentIndex(initialIndex);
      }, 50);
    }
  }, [initialIndex, imageItems.length]);

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: Array<{ index: number | null }> }) => {
      if (viewableItems.length > 0 && viewableItems[0].index != null) {
        setCurrentIndex(viewableItems[0].index);
      }
    }
  ).current;

  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 50,
  }).current;

  const handleShare = useCallback(async () => {
    const item = imageItems[currentIndex];
    if (!item) return;
    try {
      await Share.share({
        url: item.url,
        message: item.caption || item.url,
      });
    } catch (e) {
      // Ignore share errors
    }
  }, [currentIndex, imageItems]);

  const currentItem = imageItems[currentIndex];

  if (imageItems.length === 0) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

        {/* Header */}
        <View style={[styles.header, { paddingTop: Platform.OS === 'ios' ? 8 : insets.top + 8 }]}>
          <TouchableOpacity onPress={onClose} style={styles.headerButton} activeOpacity={0.7}>
            <MaterialIcons name="close" size={26} color="#fff" />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={styles.headerCounter}>
              {currentIndex + 1} / {imageItems.length}
            </Text>
            {currentItem?.time ? (
              <Text style={styles.headerTime}>{currentItem.time}</Text>
            ) : null}
          </View>
          <TouchableOpacity onPress={handleShare} style={styles.headerButton} activeOpacity={0.7}>
            <MaterialIcons name="share" size={24} color="#fff" />
          </TouchableOpacity>
        </View>

        {/* Image Gallery */}
        <FlatList
          ref={flatListRef}
          data={imageItems}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          keyExtractor={(item) => item.messageId + item.url}
          onLayout={onLayout}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={viewabilityConfig}
          getItemLayout={(_, index) => ({
            length: SCREEN_WIDTH,
            offset: SCREEN_WIDTH * index,
            index,
          })}
          renderItem={({ item }) => (
            <View style={styles.imageWrapper}>
              <ExpoImage
                source={{ uri: item.url }}
                style={styles.fullImage}
                contentFit="contain"
                transition={200}
              />
            </View>
          )}
        />

        {/* Caption */}
        {currentItem?.caption ? (
          <View style={styles.captionContainer}>
            <Text style={styles.captionText} numberOfLines={3}>
              {currentItem.caption}
            </Text>
          </View>
        ) : null}

        {/* Thumbnail strip (only if more than 1 image) */}
        {imageItems.length > 1 && (
          <View style={styles.thumbnailStrip}>
            <FlatList
              data={imageItems}
              horizontal
              showsHorizontalScrollIndicator={false}
              keyExtractor={(item) => 'thumb-' + item.messageId}
              contentContainerStyle={styles.thumbnailContent}
              renderItem={({ item, index }) => (
                <TouchableOpacity
                  onPress={() => {
                    flatListRef.current?.scrollToIndex({ index, animated: true });
                    setCurrentIndex(index);
                  }}
                  activeOpacity={0.8}
                >
                  <ExpoImage
                    source={{ uri: item.url }}
                    style={[
                      styles.thumbnail,
                      currentIndex === index && styles.thumbnailActive,
                    ]}
                    contentFit="cover"
                  />
                </TouchableOpacity>
              )}
            />
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingBottom: 8,
    zIndex: 10,
  },
  headerButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: {
    alignItems: 'center',
  },
  headerCounter: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  headerTime: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 12,
    marginTop: 2,
  },
  imageWrapper: {
    width: SCREEN_WIDTH,
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullImage: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT * 0.65,
  },
  captionContainer: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  captionText: {
    color: '#fff',
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  thumbnailStrip: {
    paddingVertical: 10,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  thumbnailContent: {
    paddingHorizontal: 12,
    gap: 6,
  },
  thumbnail: {
    width: 52,
    height: 52,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  thumbnailActive: {
    borderColor: '#fff',
  },
});
