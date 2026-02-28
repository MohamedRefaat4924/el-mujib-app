import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Linking,
  Dimensions,
  Modal,
} from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { ChatMessage, MessageData, InteractiveMessageData, TemplateComponent } from '@/lib/types';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const MAX_BUBBLE_WIDTH = SCREEN_WIDTH * 0.78;

interface MessageBubbleProps {
  message: ChatMessage;
  onInteractiveButtonPress?: (id: string, title: string) => void;
  onImagePress?: (url: string) => void;
}

export function MessageBubble({ message, onInteractiveButtonPress, onImagePress }: MessageBubbleProps) {
  const isOutgoing = message.message_from === 2;
  const [imageViewerUrl, setImageViewerUrl] = useState<string | null>(null);

  const renderContent = () => {
    switch (message.message_type) {
      case 'text':
        return renderTextMessage();
      case 'image':
        return renderImageMessage();
      case 'audio':
        return renderAudioMessage();
      case 'video':
        return renderVideoMessage();
      case 'document':
        return renderDocumentMessage();
      case 'sticker':
        return renderStickerMessage();
      case 'contacts':
        return renderContactsMessage();
      case 'location':
        return renderLocationMessage();
      case 'interactive':
        return renderInteractiveMessage();
      case 'template':
        return renderTemplateMessage();
      case 'reaction':
        return renderReactionMessage();
      default:
        return renderUnsupportedMessage();
    }
  };

  const renderTextMessage = () => {
    const text = message.formatted_message || '';
    return (
      <Text style={[styles.messageText, isOutgoing && styles.outgoingText]}>
        {formatTextWithHtml(text)}
      </Text>
    );
  };

  const renderImageMessage = () => {
    const mediaUrl = message.__data?.media_url;
    const caption = message.__data?.caption || message.formatted_message;
    return (
      <View>
        {mediaUrl ? (
          <TouchableOpacity
            onPress={() => {
              setImageViewerUrl(mediaUrl);
              onImagePress?.(mediaUrl);
            }}
            activeOpacity={0.9}
          >
            <ExpoImage
              source={{ uri: mediaUrl }}
              style={styles.messageImage}
              contentFit="cover"
              transition={200}
            />
          </TouchableOpacity>
        ) : (
          <View style={styles.mediaPlaceholder}>
            <MaterialIcons name="image" size={32} color="#9BA1A6" />
            <Text style={styles.placeholderText}>Image</Text>
          </View>
        )}
        {caption ? (
          <Text style={[styles.captionText, isOutgoing && styles.outgoingText]}>{caption}</Text>
        ) : null}
        {imageViewerUrl && (
          <Modal visible transparent animationType="fade" onRequestClose={() => setImageViewerUrl(null)}>
            <View style={styles.imageViewerOverlay}>
              <TouchableOpacity style={styles.imageViewerClose} onPress={() => setImageViewerUrl(null)}>
                <MaterialIcons name="close" size={28} color="#fff" />
              </TouchableOpacity>
              <ExpoImage
                source={{ uri: imageViewerUrl }}
                style={styles.imageViewerImage}
                contentFit="contain"
              />
            </View>
          </Modal>
        )}
      </View>
    );
  };

  const renderAudioMessage = () => {
    const mediaUrl = message.__data?.media_url;
    return (
      <View style={styles.audioContainer}>
        <TouchableOpacity
          style={styles.audioPlayBtn}
          onPress={() => mediaUrl && Linking.openURL(mediaUrl)}
        >
          <MaterialIcons name="play-circle-fill" size={36} color={isOutgoing ? '#089B21' : '#555'} />
        </TouchableOpacity>
        <View style={styles.audioWaveform}>
          {Array.from({ length: 20 }).map((_, i) => (
            <View
              key={i}
              style={[
                styles.audioBar,
                {
                  height: 4 + Math.random() * 16,
                  backgroundColor: isOutgoing ? '#089B21' : '#9BA1A6',
                },
              ]}
            />
          ))}
        </View>
      </View>
    );
  };

  const renderVideoMessage = () => {
    const mediaUrl = message.__data?.media_url;
    const caption = message.__data?.caption || message.formatted_message;
    return (
      <View>
        <TouchableOpacity
          style={styles.videoContainer}
          onPress={() => mediaUrl && Linking.openURL(mediaUrl)}
          activeOpacity={0.8}
        >
          {mediaUrl ? (
            <ExpoImage
              source={{ uri: mediaUrl }}
              style={styles.messageImage}
              contentFit="cover"
            />
          ) : null}
          <View style={styles.videoPlayOverlay}>
            <MaterialIcons name="play-circle-fill" size={48} color="rgba(255,255,255,0.9)" />
          </View>
        </TouchableOpacity>
        {caption ? (
          <Text style={[styles.captionText, isOutgoing && styles.outgoingText]}>{caption}</Text>
        ) : null}
      </View>
    );
  };

  const renderDocumentMessage = () => {
    const mediaUrl = message.__data?.media_url;
    const filename = message.__data?.filename || 'Document';
    return (
      <TouchableOpacity
        style={styles.documentContainer}
        onPress={() => mediaUrl && Linking.openURL(mediaUrl)}
        activeOpacity={0.7}
      >
        <View style={styles.documentIcon}>
          <MaterialIcons name="description" size={28} color="#089B21" />
        </View>
        <View style={styles.documentInfo}>
          <Text style={[styles.documentName, isOutgoing && styles.outgoingText]} numberOfLines={2}>
            {filename}
          </Text>
          <Text style={styles.documentType}>
            {message.__data?.mime_type || 'Document'}
          </Text>
        </View>
        <MaterialIcons name="download" size={22} color="#089B21" />
      </TouchableOpacity>
    );
  };

  const renderStickerMessage = () => {
    const mediaUrl = message.__data?.media_url;
    return mediaUrl ? (
      <ExpoImage
        source={{ uri: mediaUrl }}
        style={styles.stickerImage}
        contentFit="contain"
        transition={200}
      />
    ) : (
      <View style={styles.mediaPlaceholder}>
        <MaterialIcons name="emoji-emotions" size={32} color="#9BA1A6" />
      </View>
    );
  };

  const renderContactsMessage = () => {
    const contacts = message.__data?.contact_data || [];
    return (
      <View>
        {contacts.map((contact: any, idx: number) => (
          <View key={idx} style={styles.contactCard}>
            <MaterialIcons name="person" size={24} color="#089B21" />
            <View style={styles.contactCardInfo}>
              <Text style={[styles.contactCardName, isOutgoing && styles.outgoingText]}>
                {contact.name?.formatted_name || contact.name?.first_name || 'Unknown'}
              </Text>
              {contact.phones?.map((phone: any, pIdx: number) => (
                <Text key={pIdx} style={styles.contactCardPhone}>
                  {phone.phone || ''}
                </Text>
              ))}
            </View>
          </View>
        ))}
      </View>
    );
  };

  const renderLocationMessage = () => {
    const lat = message.__data?.latitude;
    const lng = message.__data?.longitude;
    const mapUrl = lat && lng ? `https://maps.google.com/?q=${lat},${lng}` : null;
    return (
      <TouchableOpacity
        style={styles.locationContainer}
        onPress={() => mapUrl && Linking.openURL(mapUrl)}
        activeOpacity={0.7}
      >
        <MaterialIcons name="location-on" size={32} color="#F5365C" />
        <Text style={[styles.locationText, isOutgoing && styles.outgoingText]}>
          {lat && lng ? `${lat.toFixed(4)}, ${lng.toFixed(4)}` : 'Location shared'}
        </Text>
        <Text style={styles.locationLink}>Open in Maps</Text>
      </TouchableOpacity>
    );
  };

  const renderInteractiveMessage = () => {
    const interactiveData = message.__data?.interaction_message_data;
    if (!interactiveData) {
      return <Text style={[styles.messageText, isOutgoing && styles.outgoingText]}>{message.formatted_message || 'Interactive message'}</Text>;
    }

    const type = interactiveData.type;

    // Button reply or list reply
    if (interactiveData.button_reply) {
      return (
        <View style={styles.interactiveReply}>
          <MaterialIcons name="reply" size={16} color="#089B21" />
          <Text style={[styles.messageText, isOutgoing && styles.outgoingText]}>
            {interactiveData.button_reply.title}
          </Text>
        </View>
      );
    }

    if (interactiveData.list_reply) {
      return (
        <View style={styles.interactiveReply}>
          <MaterialIcons name="list" size={16} color="#089B21" />
          <Text style={[styles.messageText, isOutgoing && styles.outgoingText]}>
            {interactiveData.list_reply.title}
          </Text>
          {interactiveData.list_reply.description && (
            <Text style={styles.interactiveDesc}>{interactiveData.list_reply.description}</Text>
          )}
        </View>
      );
    }

    // Full interactive message with buttons/lists
    return (
      <View>
        {/* Header */}
        {interactiveData.header?.text && (
          <Text style={[styles.interactiveHeader, isOutgoing && styles.outgoingText]}>
            {interactiveData.header.text}
          </Text>
        )}
        {interactiveData.header?.image?.link && (
          <ExpoImage
            source={{ uri: interactiveData.header.image.link }}
            style={styles.interactiveHeaderImage}
            contentFit="cover"
          />
        )}

        {/* Body */}
        {interactiveData.body?.text && (
          <Text style={[styles.messageText, isOutgoing && styles.outgoingText]}>
            {interactiveData.body.text}
          </Text>
        )}

        {/* Footer */}
        {interactiveData.footer?.text && (
          <Text style={styles.interactiveFooter}>{interactiveData.footer.text}</Text>
        )}

        {/* Buttons */}
        {interactiveData.action?.buttons?.map((btn, idx) => (
          <TouchableOpacity
            key={idx}
            style={styles.interactiveButton}
            onPress={() => {
              if (btn.reply) {
                onInteractiveButtonPress?.(btn.reply.id, btn.reply.title);
              } else if (btn.url) {
                Linking.openURL(btn.url);
              }
            }}
            activeOpacity={0.7}
          >
            <Text style={styles.interactiveButtonText}>
              {btn.reply?.title || 'Button'}
            </Text>
          </TouchableOpacity>
        ))}

        {/* List button */}
        {interactiveData.action?.button && (
          <TouchableOpacity style={styles.interactiveButton} activeOpacity={0.7}>
            <MaterialIcons name="list" size={16} color="#089B21" />
            <Text style={styles.interactiveButtonText}>
              {interactiveData.action.button}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  const renderTemplateMessage = () => {
    const templateData = message.__data?.template_message_data;
    const components = templateData?.components || [];

    return (
      <View>
        {components.map((comp: TemplateComponent, idx: number) => {
          if (comp.type === 'HEADER' || comp.type === 'header') {
            if (comp.parameters?.[0]?.image?.link) {
              return (
                <ExpoImage
                  key={idx}
                  source={{ uri: comp.parameters[0].image.link }}
                  style={styles.interactiveHeaderImage}
                  contentFit="cover"
                />
              );
            }
            return comp.text ? (
              <Text key={idx} style={[styles.interactiveHeader, isOutgoing && styles.outgoingText]}>
                {comp.text}
              </Text>
            ) : null;
          }
          if (comp.type === 'BODY' || comp.type === 'body') {
            return (
              <Text key={idx} style={[styles.messageText, isOutgoing && styles.outgoingText]}>
                {comp.text || message.formatted_message || ''}
              </Text>
            );
          }
          if (comp.type === 'FOOTER' || comp.type === 'footer') {
            return comp.text ? (
              <Text key={idx} style={styles.interactiveFooter}>{comp.text}</Text>
            ) : null;
          }
          if ((comp.type === 'BUTTONS' || comp.type === 'buttons') && comp.buttons) {
            return (
              <View key={idx}>
                {comp.buttons.map((btn, bIdx) => (
                  <TouchableOpacity
                    key={bIdx}
                    style={styles.interactiveButton}
                    onPress={() => {
                      if (btn.url) Linking.openURL(btn.url);
                      if (btn.phone_number) Linking.openURL(`tel:${btn.phone_number}`);
                    }}
                    activeOpacity={0.7}
                  >
                    {btn.type === 'URL' && <MaterialIcons name="open-in-new" size={14} color="#089B21" />}
                    {btn.type === 'PHONE_NUMBER' && <MaterialIcons name="phone" size={14} color="#089B21" />}
                    <Text style={styles.interactiveButtonText}>{btn.text}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            );
          }
          return null;
        })}
        {components.length === 0 && (
          <Text style={[styles.messageText, isOutgoing && styles.outgoingText]}>
            {message.formatted_message || 'Template message'}
          </Text>
        )}
      </View>
    );
  };

  const renderReactionMessage = () => {
    return (
      <View style={styles.reactionContainer}>
        <Text style={styles.reactionEmoji}>{message.reaction?.emoji || '👍'}</Text>
      </View>
    );
  };

  const renderUnsupportedMessage = () => {
    return (
      <View style={styles.unsupportedContainer}>
        <MaterialIcons name="info" size={16} color="#9BA1A6" />
        <Text style={styles.unsupportedText}>
          {message.formatted_message || 'Unsupported message type'}
        </Text>
      </View>
    );
  };

  const getStatusIcon = () => {
    if (!isOutgoing) return null;
    switch (message.status) {
      case 'sent':
        return <MaterialIcons name="check" size={14} color="#9BA1A6" />;
      case 'delivered':
        return <MaterialIcons name="done-all" size={14} color="#9BA1A6" />;
      case 'read':
        return <MaterialIcons name="done-all" size={14} color="#34B7F1" />;
      case 'failed':
        return <MaterialIcons name="error" size={14} color="#F5365C" />;
      default:
        return <MaterialIcons name="schedule" size={12} color="#9BA1A6" />;
    }
  };

  // Skip reaction messages that are standalone
  if (message.message_type === 'reaction') {
    return renderReactionMessage();
  }

  return (
    <View style={[styles.bubbleRow, isOutgoing ? styles.bubbleRowRight : styles.bubbleRowLeft]}>
      <View
        style={[
          styles.bubble,
          isOutgoing ? styles.outgoingBubble : styles.incomingBubble,
          message.message_type === 'sticker' && styles.stickerBubble,
        ]}
      >
        {renderContent()}
        <View style={styles.metaRow}>
          <Text style={[styles.timeText, isOutgoing && styles.outgoingTimeText]}>
            {message.formatted_message_time || ''}
          </Text>
          {getStatusIcon()}
        </View>
        {message.whatsapp_message_error && (
          <View style={styles.errorRow}>
            <MaterialIcons name="error-outline" size={12} color="#F5365C" />
            <Text style={styles.errorText}>{message.whatsapp_message_error}</Text>
          </View>
        )}
      </View>
    </View>
  );
}

function formatTextWithHtml(text: string): string {
  // Strip basic HTML tags for display
  return text
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<b>(.*?)<\/b>/gi, '$1')
    .replace(/<i>(.*?)<\/i>/gi, '$1')
    .replace(/<a[^>]*>(.*?)<\/a>/gi, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'");
}

const styles = StyleSheet.create({
  bubbleRow: {
    paddingHorizontal: 12,
    marginVertical: 2,
  },
  bubbleRowLeft: {
    alignItems: 'flex-start',
  },
  bubbleRowRight: {
    alignItems: 'flex-end',
  },
  bubble: {
    maxWidth: MAX_BUBBLE_WIDTH,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 1,
  },
  incomingBubble: {
    backgroundColor: '#FFFFFF',
    borderBottomLeftRadius: 4,
  },
  outgoingBubble: {
    backgroundColor: '#DCF8C6',
    borderBottomRightRadius: 4,
  },
  stickerBubble: {
    backgroundColor: 'transparent',
    shadowOpacity: 0,
    elevation: 0,
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
  messageText: {
    fontSize: 15,
    lineHeight: 21,
    color: '#1B1B23',
  },
  outgoingText: {
    color: '#1B1B23',
  },
  captionText: {
    fontSize: 14,
    lineHeight: 20,
    color: '#1B1B23',
    marginTop: 6,
    paddingHorizontal: 2,
  },
  messageImage: {
    width: MAX_BUBBLE_WIDTH - 24,
    height: 200,
    borderRadius: 12,
  },
  mediaPlaceholder: {
    width: MAX_BUBBLE_WIDTH - 24,
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
  audioContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minWidth: 200,
  },
  audioPlayBtn: {
    padding: 2,
  },
  audioWaveform: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    flex: 1,
  },
  audioBar: {
    width: 3,
    borderRadius: 1.5,
  },
  videoContainer: {
    position: 'relative',
  },
  videoPlayOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderRadius: 12,
  },
  documentContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minWidth: 200,
  },
  documentIcon: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: 'rgba(8,155,33,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  documentInfo: {
    flex: 1,
  },
  documentName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1B1B23',
  },
  documentType: {
    fontSize: 11,
    color: '#9BA1A6',
    marginTop: 2,
  },
  stickerImage: {
    width: 150,
    height: 150,
  },
  contactCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 4,
  },
  contactCardInfo: {
    flex: 1,
  },
  contactCardName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1B1B23',
  },
  contactCardPhone: {
    fontSize: 12,
    color: '#687076',
  },
  locationContainer: {
    alignItems: 'center',
    gap: 4,
    paddingVertical: 8,
  },
  locationText: {
    fontSize: 13,
    color: '#1B1B23',
  },
  locationLink: {
    fontSize: 12,
    color: '#089B21',
    fontWeight: '600',
  },
  interactiveReply: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  interactiveDesc: {
    fontSize: 12,
    color: '#687076',
    marginTop: 2,
  },
  interactiveHeader: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1B1B23',
    marginBottom: 4,
  },
  interactiveHeaderImage: {
    width: MAX_BUBBLE_WIDTH - 24,
    height: 160,
    borderRadius: 10,
    marginBottom: 6,
  },
  interactiveFooter: {
    fontSize: 12,
    color: '#687076',
    marginTop: 4,
  },
  interactiveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderTopWidth: 0.5,
    borderTopColor: 'rgba(0,0,0,0.1)',
    paddingVertical: 10,
    marginTop: 4,
  },
  interactiveButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#089B21',
  },
  reactionContainer: {
    alignSelf: 'center',
    paddingVertical: 2,
  },
  reactionEmoji: {
    fontSize: 28,
  },
  unsupportedContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  unsupportedText: {
    fontSize: 13,
    color: '#9BA1A6',
    fontStyle: 'italic',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 4,
    marginTop: 4,
  },
  timeText: {
    fontSize: 11,
    color: '#9BA1A6',
  },
  outgoingTimeText: {
    color: '#687076',
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  errorText: {
    fontSize: 11,
    color: '#F5365C',
  },
  imageViewerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  imageViewerClose: {
    position: 'absolute',
    top: 50,
    right: 20,
    zIndex: 10,
    padding: 8,
  },
  imageViewerImage: {
    width: SCREEN_WIDTH,
    height: SCREEN_WIDTH,
  },
});
