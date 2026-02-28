// Auth types
export interface LoginPayload {
  email: string;
  password: string;
}

export interface AuthData {
  token: string;
  vendor_uid: string;
  uuid: string;
  username: string;
  first_name: string;
  last_name: string;
  email: string;
  mobile_number: string;
  [key: string]: any;
}

// Contact types
export interface ContactLabel {
  _id: number;
  title: string;
  text_color: string;
  bg_color: string;
}

export interface LastMessage {
  formatted_message_time: string;
  _uid: string;
}

export interface Contact {
  _uid: string;
  full_name: string;
  name_initials: string;
  wa_id: string;
  unread_messages_count: number;
  labels: ContactLabel[];
  last_message: LastMessage | null;
  assigned_users__id?: string;
  [key: string]: any;
}

// Message types
export type MessageType =
  | 'text'
  | 'image'
  | 'audio'
  | 'video'
  | 'document'
  | 'sticker'
  | 'contacts'
  | 'location'
  | 'interactive'
  | 'template'
  | 'reaction'
  | 'unsupported';

export type MessageFrom = 1 | 2; // 1 = incoming, 2 = outgoing

export type MessageStatus = 'sent' | 'delivered' | 'read' | 'failed' | 'pending';

export interface InteractiveButton {
  type: string;
  reply?: { id: string; title: string };
  url?: string;
  phone_number?: string;
}

export interface InteractiveSection {
  title: string;
  rows: Array<{ id: string; title: string; description?: string }>;
}

export interface InteractiveMessageData {
  type?: string;
  header?: { type: string; text?: string; image?: { link: string }; video?: { link: string }; document?: { link: string } };
  body?: { text: string };
  footer?: { text: string };
  action?: {
    buttons?: InteractiveButton[];
    button?: string;
    sections?: InteractiveSection[];
  };
  button_reply?: { id: string; title: string };
  list_reply?: { id: string; title: string; description?: string };
}

export interface TemplateComponent {
  type: string;
  sub_type?: string;
  parameters?: Array<{
    type: string;
    text?: string;
    image?: { link: string };
    video?: { link: string };
    document?: { link: string; filename?: string };
    payload?: string;
  }>;
  text?: string;
  buttons?: Array<{ type: string; text: string; url?: string; phone_number?: string }>;
}

export interface TemplateMessageData {
  name?: string;
  language?: { code: string };
  components?: TemplateComponent[];
}

export interface MessageData {
  interaction_message_data?: InteractiveMessageData;
  template_message_data?: TemplateMessageData;
  contact_data?: Array<{
    name?: { formatted_name?: string; first_name?: string; last_name?: string };
    phones?: Array<{ phone?: string; type?: string }>;
    emails?: Array<{ email?: string; type?: string }>;
  }>;
  media_url?: string;
  caption?: string;
  latitude?: number;
  longitude?: number;
  filename?: string;
  mime_type?: string;
}

export interface ChatMessage {
  _uid: string;
  status: MessageStatus;
  message_from: MessageFrom;
  message_type: MessageType;
  formatted_message: string;
  formatted_message_time: string;
  whatsapp_message_error?: string;
  template_message?: string;
  __data: MessageData;
  reaction?: { emoji: string };
}

// Template types
export interface WhatsAppTemplate {
  _uid: string;
  template_name: string;
  language: string;
  category: string;
  status: string;
  components: TemplateComponent[];
  [key: string]: any;
}

// Vendor messaging user
export interface VendorMessagingUser {
  id: string;
  _uid: string;
  value: string;
  vendors__id: string | null;
}

// Label dropdown item
export interface LabelDropdownItem {
  id: string;
  value: string;
  textColor: string;
  bgColor: string;
}

// Pusher event data
export interface VendorChannelEventData {
  contactUid: string;
  contactDescription?: string;
  isNewIncomingMessage?: boolean;
  lastMessageUid?: string;
  formatted_last_message_time?: string;
  message_status?: string;
  [key: string]: any;
}
