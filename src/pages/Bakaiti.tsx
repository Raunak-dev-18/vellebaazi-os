import { useState, useEffect, useRef, useCallback } from "react";
import { Search, Send, Phone, Video, Info, ArrowLeft, Image as ImageIcon, Paperclip, X, Users, Link, ExternalLink, MoreVertical, Smile, Forward, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAuth } from "@/contexts/AuthContext";
import { getDatabase, ref, push, set, onValue, get, update, remove } from "firebase/database";
import { useLocation, useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { uploadToChatS3 } from "@/lib/supabase";
import { DocumentCard, VideoCard, AudioCard } from "@/components/DocumentCard";
import { ChatMarkdown } from "@/components/ChatMarkdown";
import { hasCognixMention, extractCognixQuery, getCognixResponseStream, COGNIX_USER } from "@/lib/ai";

// Quick reaction emojis
const QUICK_REACTIONS = ['❤️', '😂', '😮', '😢', '😡', '👍'];

// Giphy API
const GIPHY_API_KEY = import.meta.env.VITE_GIPHY_API_KEY;

interface GiphyGif {
  id: string;
  title: string;
  images: {
    fixed_height: {
      url: string;
      width: string;
      height: string;
    };
    original: {
      url: string;
    };
  };
}

interface LinkPreview {
  url: string;
  title?: string;
  description?: string;
  image?: string;
  siteName?: string;
}

interface Chat {
  chatId: string;
  otherUserId: string;
  otherUsername: string;
  otherUserAvatar: string;
  lastMessage: string;
  lastMessageTime: string;
  unreadCount?: number;
}

interface MessageReaction {
  emoji: string;
  userId: string;
  username: string;
}

interface Message {
  id: string;
  senderId: string;
  text: string;
  timestamp: string;
  fileUrl?: string;
  fileName?: string;
  fileType?: string;
  linkPreview?: LinkPreview;
  reactions?: { [key: string]: MessageReaction };
  forwarded?: boolean;
}

export default function Bakaiti() {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [chats, setChats] = useState<Chat[]>([]);
  const [selectedChat, setSelectedChat] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messageText, setMessageText] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isLoadingChats, setIsLoadingChats] = useState(true);
  const [isTyping, setIsTyping] = useState(false);
  const [otherUserTyping, setOtherUserTyping] = useState(false);
  const [cognixTyping, setCognixTyping] = useState(false);
  const [cognixStreamingMessage, setCognixStreamingMessage] = useState<string>("");
  const [cognixMessageId, setCognixMessageId] = useState<string | null>(null);
  const [allMessagesData, setAllMessagesData] = useState<any[]>([]);
  const [displayedCount, setDisplayedCount] = useState(5);
  const [hasMoreMessages, setHasMoreMessages] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [linkPreview, setLinkPreview] = useState<LinkPreview | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [activeEmojiPicker, setActiveEmojiPicker] = useState<string | null>(null);
  const [hoveredMessage, setHoveredMessage] = useState<string | null>(null);
  const [showGifPicker, setShowGifPicker] = useState(false);
  const [gifs, setGifs] = useState<GiphyGif[]>([]);
  const [gifSearchQuery, setGifSearchQuery] = useState("");
  const [isLoadingGifs, setIsLoadingGifs] = useState(false);
  const [activeReactionDetails, setActiveReactionDetails] = useState<{ messageId: string; emoji: string } | null>(null);
  const [activeMessageMenu, setActiveMessageMenu] = useState<string | null>(null);
  const [showForwardDialog, setShowForwardDialog] = useState(false);
  const [messageToForward, setMessageToForward] = useState<Message | null>(null);
  const [forwardSearchQuery, setForwardSearchQuery] = useState("");
  const [isForwarding, setIsForwarding] = useState(false);
  const [gifOffset, setGifOffset] = useState(0);
  const [hasMoreGifs, setHasMoreGifs] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesTopRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const linkPreviewTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const username = user?.displayName || user?.email?.split('@')[0] || 'user';

  // URL regex pattern
  const urlRegex = /(https?:\/\/[^\s]+)/gi;

  // Extract first URL from text
  const extractUrl = (text: string): string | null => {
    const matches = text.match(urlRegex);
    return matches ? matches[0] : null;
  };

  // Fetch link preview using a free API
  const fetchLinkPreview = useCallback(async (url: string) => {
    setIsLoadingPreview(true);
    try {
      // Using LinkPreview API (free tier available)
      // Alternative: You can use your own backend or other services
      const response = await fetch(`https://api.linkpreview.net/?key=free&q=${encodeURIComponent(url)}`);
      
      if (!response.ok) {
        // Fallback: Create basic preview from URL
        const urlObj = new URL(url);
        setLinkPreview({
          url,
          title: urlObj.hostname,
          siteName: urlObj.hostname,
        });
        return;
      }
      
      const data = await response.json();
      const parsedUrl = new URL(url);
      setLinkPreview({
        url,
        title: data.title || parsedUrl.hostname,
        description: data.description,
        image: data.image,
        siteName: data.siteName || parsedUrl.hostname,
      });
    } catch (error) {
      // Fallback: Create basic preview from URL
      try {
        const urlObj = new URL(url);
        setLinkPreview({
          url,
          title: urlObj.hostname,
          siteName: urlObj.hostname,
        });
      } catch {
        setLinkPreview(null);
      }
    } finally {
      setIsLoadingPreview(false);
    }
  }, []);

  // Detect URL in message text and fetch preview
  useEffect(() => {
    if (linkPreviewTimeoutRef.current) {
      clearTimeout(linkPreviewTimeoutRef.current);
    }

    const url = extractUrl(messageText);
    
    if (!url) {
      setLinkPreview(null);
      return;
    }

    // Debounce the preview fetch
    linkPreviewTimeoutRef.current = setTimeout(() => {
      fetchLinkPreview(url);
    }, 500);

    return () => {
      if (linkPreviewTimeoutRef.current) {
        clearTimeout(linkPreviewTimeoutRef.current);
      }
    };
  }, [messageText, fetchLinkPreview]);

  // Check if we need to open a chat from navigation state
  useEffect(() => {
    if (location.state?.openChatWith) {
      const { userId, username: otherUsername, avatar } = location.state.openChatWith;
      openOrCreateChat(userId, otherUsername, avatar);
    }
  }, [location.state]);

  // Fetch user's chats with chunked loading
  useEffect(() => {
    if (!user) return;

    const db = getDatabase();
    const chatsRef = ref(db, `userChats/${user.uid}`);
    
    const unsubscribe = onValue(chatsRef, async (snapshot) => {
      if (snapshot.exists()) {
        const chatsData = snapshot.val();
        const chatEntries = Object.entries(chatsData);
        
        // Sort by last message time first (before fetching avatars)
        const sortedEntries = chatEntries.sort(([, a]: [string, any], [, b]: [string, any]) => 
          new Date(b.lastMessageTime || 0).getTime() - new Date(a.lastMessageTime || 0).getTime()
        );
        
        // Load first 10 chats immediately
        const firstBatch = sortedEntries.slice(0, 10);
        const remainingChats = sortedEntries.slice(10);
        
        // Process first batch
        const firstBatchChats: Chat[] = [];
        for (const [chatId, chatData] of firstBatch) {
          const data = chatData as any;
          
          if (data.otherUserId === user.uid) continue;
          
          // Use stored avatar initially for faster load
          firstBatchChats.push({
            chatId,
            otherUserId: data.otherUserId,
            otherUsername: data.otherUsername,
            otherUserAvatar: data.otherUserAvatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${data.otherUsername}`,
            lastMessage: data.lastMessage || '',
            lastMessageTime: data.lastMessageTime || ''
          });
        }
        
        setChats(firstBatchChats);
        setIsLoadingChats(false);
        
        // Load remaining chats in background
        if (remainingChats.length > 0) {
          setTimeout(async () => {
            const allChats = [...firstBatchChats];
            
            // Process remaining chats in chunks of 20
            for (let i = 0; i < remainingChats.length; i += 20) {
              const chunk = remainingChats.slice(i, i + 20);
              
              for (const [chatId, chatData] of chunk) {
                const data = chatData as any;
                
                if (data.otherUserId === user.uid) continue;
                
                allChats.push({
                  chatId,
                  otherUserId: data.otherUserId,
                  otherUsername: data.otherUsername,
                  otherUserAvatar: data.otherUserAvatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${data.otherUsername}`,
                  lastMessage: data.lastMessage || '',
                  lastMessageTime: data.lastMessageTime || ''
                });
              }
              
              setChats([...allChats]);
              
              // Small delay between chunks to avoid blocking
              if (i + 20 < remainingChats.length) {
                await new Promise(resolve => setTimeout(resolve, 100));
              }
            }
          }, 0);
        }
        
        // Update avatars in background for all chats
        setTimeout(async () => {
          const updatedChats = await Promise.all(
            sortedEntries.map(async ([chatId, chatData]) => {
              const data = chatData as any;
              
              if (data.otherUserId === user.uid) return null;
              
              try {
                const otherUserRef = ref(db, `users/${data.otherUserId}`);
                const otherUserSnapshot = await get(otherUserRef);
                const otherUserData = otherUserSnapshot.val();
                const currentAvatar = otherUserData?.photoURL || data.otherUserAvatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${data.otherUsername}`;
                
                return {
                  chatId,
                  otherUserId: data.otherUserId,
                  otherUsername: data.otherUsername,
                  otherUserAvatar: currentAvatar,
                  lastMessage: data.lastMessage || '',
                  lastMessageTime: data.lastMessageTime || ''
                };
              } catch (error) {
                console.error("Error fetching avatar:", error);
                return {
                  chatId,
                  otherUserId: data.otherUserId,
                  otherUsername: data.otherUsername,
                  otherUserAvatar: data.otherUserAvatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${data.otherUsername}`,
                  lastMessage: data.lastMessage || '',
                  lastMessageTime: data.lastMessageTime || ''
                };
              }
            })
          );
          
          const validChats = updatedChats.filter((chat): chat is Chat => chat !== null);
          setChats(validChats);
        }, 500);
        
      } else {
        setChats([]);
        setIsLoadingChats(false);
      }
    });

    return () => unsubscribe();
  }, [user]);

  // Listen to messages in selected chat with pagination
  useEffect(() => {
    if (!selectedChat) return;

    // Reset pagination when chat changes
    setDisplayedCount(5);
    setAllMessagesData([]);
    setMessages([]);

    const db = getDatabase();
    const messagesRef = ref(db, `messages/${selectedChat.chatId}`);
    
    const unsubscribe = onValue(messagesRef, (snapshot) => {
      if (snapshot.exists()) {
        const messagesData = snapshot.val();
        const messageEntries = Object.entries(messagesData);
        
        // Sort by timestamp (oldest first)
        const sortedEntries = messageEntries.sort(([, a]: [string, any], [, b]: [string, any]) => 
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        );
        
        // Store all messages data
        setAllMessagesData(sortedEntries);
        setHasMoreMessages(sortedEntries.length > displayedCount);
        
        // Show only the last N messages
        const messagesToShow = sortedEntries.slice(-displayedCount);
        const messagesArray: Message[] = messagesToShow.map(([id, data]: [string, any]) => ({
          id,
          senderId: data.senderId,
          text: data.text,
          timestamp: data.timestamp,
          fileUrl: data.fileUrl,
          fileName: data.fileName,
          fileType: data.fileType,
          reactions: data.reactions || {},
          forwarded: data.forwarded || false
        }));
        
        setMessages(messagesArray);
      } else {
        setMessages([]);
        setAllMessagesData([]);
        setHasMoreMessages(false);
      }
    });

    return () => unsubscribe();
  }, [selectedChat]);

  // Update displayed messages when count changes
  useEffect(() => {
    if (allMessagesData.length === 0) return;
    
    setHasMoreMessages(allMessagesData.length > displayedCount);
    
    const messagesToShow = allMessagesData.slice(-displayedCount);
    const messagesArray: Message[] = messagesToShow.map(([id, data]: [string, any]) => ({
      id,
      senderId: data.senderId,
      text: data.text,
      timestamp: data.timestamp,
      fileUrl: data.fileUrl,
      fileName: data.fileName,
      fileType: data.fileType,
      reactions: data.reactions || {},
      forwarded: data.forwarded || false
    }));
    
    setMessages(messagesArray);
  }, [displayedCount, allMessagesData]);

  const loadMoreMessages = () => {
    if (isLoadingMore || !hasMoreMessages) return;
    
    setIsLoadingMore(true);
    
    // Load 10 more messages
    setTimeout(() => {
      setDisplayedCount(prev => prev + 10);
      setIsLoadingMore(false);
    }, 200);
  };

  // Fetch trending GIFs
  const fetchTrendingGifs = async (loadMore = false) => {
    if (!GIPHY_API_KEY) return;
    
    // Only show full loading spinner for initial load, not for load more
    if (!loadMore) {
      setIsLoadingGifs(true);
    }
    
    try {
      const currentOffset = loadMore ? gifOffset : 0;
      const response = await fetch(
        `https://api.giphy.com/v1/gifs/trending?api_key=${GIPHY_API_KEY}&limit=20&offset=${currentOffset}&rating=g`
      );
      const data = await response.json();
      const newGifs = data.data || [];
      
      if (loadMore && newGifs.length > 0) {
        setGifs(prev => [...prev, ...newGifs]);
      } else if (!loadMore) {
        setGifs(newGifs);
      }
      setGifOffset(currentOffset + 20);
      setHasMoreGifs(newGifs.length === 20);
    } catch (error) {
      console.error("Error fetching trending GIFs:", error);
    } finally {
      setIsLoadingGifs(false);
    }
  };

  // Search GIFs
  const searchGifs = async (query: string, loadMore = false) => {
    if (!GIPHY_API_KEY || !query.trim()) {
      fetchTrendingGifs(false);
      return;
    }
    
    // Only show full loading spinner for initial load, not for load more
    if (!loadMore) {
      setIsLoadingGifs(true);
    }
    
    try {
      const currentOffset = loadMore ? gifOffset : 0;
      const response = await fetch(
        `https://api.giphy.com/v1/gifs/search?api_key=${GIPHY_API_KEY}&q=${encodeURIComponent(query)}&limit=20&offset=${currentOffset}&rating=g`
      );
      const data = await response.json();
      const newGifs = data.data || [];
      
      if (loadMore && newGifs.length > 0) {
        setGifs(prev => [...prev, ...newGifs]);
      } else if (!loadMore) {
        setGifs(newGifs);
      }
      setGifOffset(currentOffset + 20);
      setHasMoreGifs(newGifs.length === 20);
    } catch (error) {
      console.error("Error searching GIFs:", error);
    } finally {
      setIsLoadingGifs(false);
    }
  };

  const [isLoadingMoreGifs, setIsLoadingMoreGifs] = useState(false);
  
  const loadMoreGifs = async () => {
    if (isLoadingGifs || isLoadingMoreGifs || !hasMoreGifs) return;
    
    setIsLoadingMoreGifs(true);
    try {
      if (gifSearchQuery.trim()) {
        await searchGifs(gifSearchQuery, true);
      } else {
        await fetchTrendingGifs(true);
      }
    } finally {
      setIsLoadingMoreGifs(false);
    }
  };

  // Send GIF as message
  const sendGif = async (gif: GiphyGif) => {
    if (!user || !selectedChat) return;
    
    try {
      const db = getDatabase();
      const messagesRef = ref(db, `messages/${selectedChat.chatId}`);
      const newMessageRef = push(messagesRef);
      
      const messageData = {
        senderId: user.uid,
        text: '',
        timestamp: new Date().toISOString(),
        fileUrl: gif.images.original.url,
        fileName: gif.title || 'GIF',
        fileType: 'image/gif'
      };
      
      await set(newMessageRef, messageData);
      
      // Update last message
      const lastMessage = '🎬 GIF';
      await set(ref(db, `userChats/${user.uid}/${selectedChat.chatId}/lastMessage`), lastMessage);
      await set(ref(db, `userChats/${user.uid}/${selectedChat.chatId}/lastMessageTime`), messageData.timestamp);
      await set(ref(db, `userChats/${selectedChat.otherUserId}/${selectedChat.chatId}/lastMessage`), lastMessage);
      await set(ref(db, `userChats/${selectedChat.otherUserId}/${selectedChat.chatId}/lastMessageTime`), messageData.timestamp);
      
      setShowGifPicker(false);
      setGifSearchQuery("");
    } catch (error) {
      console.error("Error sending GIF:", error);
      toast({
        title: "Error",
        description: "Failed to send GIF",
        variant: "destructive",
      });
    }
  };

  // Load trending GIFs when picker opens
  useEffect(() => {
    if (showGifPicker) {
      // Reset and load fresh GIFs when picker opens
      setGifOffset(0);
      setGifs([]);
      setGifSearchQuery("");
      fetchTrendingGifs(false);
    }
  }, [showGifPicker]);

  // Debounced GIF search
  useEffect(() => {
    if (!showGifPicker) return;
    
    const timer = setTimeout(() => {
      setGifOffset(0);
      setGifs([]);
      if (gifSearchQuery.trim()) {
        searchGifs(gifSearchQuery, false);
      } else {
        fetchTrendingGifs(false);
      }
    }, 300);
    
    return () => clearTimeout(timer);
  }, [gifSearchQuery]);

  // Add reaction to message
  const addReaction = async (messageId: string, emoji: string) => {
    if (!user || !selectedChat) return;
    
    try {
      const db = getDatabase();
      const reactionRef = ref(db, `messages/${selectedChat.chatId}/${messageId}/reactions/${user.uid}`);
      
      // Check if user already reacted with same emoji - if so, remove it
      const existingReaction = messages.find(m => m.id === messageId)?.reactions?.[user.uid];
      
      if (existingReaction?.emoji === emoji) {
        // Remove reaction
        await set(reactionRef, null);
      } else {
        // Add/update reaction
        await set(reactionRef, {
          emoji,
          userId: user.uid,
          username: username
        });
      }
      
      setActiveEmojiPicker(null);
    } catch (error) {
      console.error("Error adding reaction:", error);
      toast({
        title: "Error",
        description: "Failed to add reaction",
        variant: "destructive",
      });
    }
  };

  // Unsend message (for sender - removes for everyone)
  const unsendMessage = async (messageId: string) => {
    if (!user || !selectedChat) return;
    
    try {
      const db = getDatabase();
      const messageRef = ref(db, `messages/${selectedChat.chatId}/${messageId}`);
      
      await remove(messageRef);
      
      setActiveMessageMenu(null);
      toast({
        title: "Message Unsent",
        description: "Message has been removed for everyone",
      });
    } catch (error) {
      console.error("Error unsending message:", error);
      toast({
        title: "Error",
        description: "Failed to unsend message",
        variant: "destructive",
      });
    }
  };

  // Delete message for me (only hides from current user)
  const deleteMessageForMe = async (messageId: string) => {
    if (!user || !selectedChat) return;
    
    try {
      const db = getDatabase();
      const deletedRef = ref(db, `deletedMessages/${user.uid}/${selectedChat.chatId}/${messageId}`);
      
      await set(deletedRef, {
        deletedAt: new Date().toISOString()
      });
      
      // Remove from local state
      setMessages(prev => prev.filter(m => m.id !== messageId));
      
      setActiveMessageMenu(null);
      toast({
        title: "Message Deleted",
        description: "Message has been deleted for you",
      });
    } catch (error) {
      console.error("Error deleting message:", error);
      toast({
        title: "Error",
        description: "Failed to delete message",
        variant: "destructive",
      });
    }
  };

  // Open forward dialog
  const openForwardDialog = (message: Message) => {
    setMessageToForward(message);
    setShowForwardDialog(true);
    setActiveMessageMenu(null);
    setForwardSearchQuery("");
  };

  // Forward message to selected chat
  const forwardMessageToChat = async (targetChat: Chat) => {
    if (!user || !messageToForward) return;
    
    setIsForwarding(true);
    try {
      const db = getDatabase();
      const messagesRef = ref(db, `messages/${targetChat.chatId}`);
      const newMessageRef = push(messagesRef);
      
      const forwardedMessage: any = {
        senderId: user.uid,
        text: messageToForward.text || '',
        timestamp: new Date().toISOString(),
        forwarded: true,
      };
      
      // Include file if present
      if (messageToForward.fileUrl) {
        forwardedMessage.fileUrl = messageToForward.fileUrl;
        forwardedMessage.fileName = messageToForward.fileName;
        forwardedMessage.fileType = messageToForward.fileType;
      }
      
      await set(newMessageRef, forwardedMessage);
      
      // Update last message in both users' chat lists
      const lastMessage = messageToForward.text || (messageToForward.fileUrl ? '📎 Forwarded' : 'Forwarded message');
      await set(ref(db, `userChats/${user.uid}/${targetChat.chatId}/lastMessage`), `↪ ${lastMessage}`);
      await set(ref(db, `userChats/${user.uid}/${targetChat.chatId}/lastMessageTime`), forwardedMessage.timestamp);
      await set(ref(db, `userChats/${targetChat.otherUserId}/${targetChat.chatId}/lastMessage`), `↪ ${lastMessage}`);
      await set(ref(db, `userChats/${targetChat.otherUserId}/${targetChat.chatId}/lastMessageTime`), forwardedMessage.timestamp);
      
      setShowForwardDialog(false);
      setMessageToForward(null);
      
      toast({
        title: "Message Forwarded",
        description: `Sent to ${targetChat.otherUsername}`,
      });
    } catch (error) {
      console.error("Error forwarding message:", error);
      toast({
        title: "Error",
        description: "Failed to forward message",
        variant: "destructive",
      });
    } finally {
      setIsForwarding(false);
    }
  };

  // Filter chats for forward dialog
  const filteredChatsForForward = chats.filter(chat => 
    chat.otherUsername.toLowerCase().includes(forwardSearchQuery.toLowerCase()) &&
    chat.chatId !== selectedChat?.chatId
  );

  // Listen to typing indicator
  useEffect(() => {
    if (!selectedChat || !user) return;

    const db = getDatabase();
    const typingRef = ref(db, `typing/${selectedChat.chatId}/${selectedChat.otherUserId}`);
    
    const unsubscribe = onValue(typingRef, (snapshot) => {
      if (snapshot.exists()) {
        const typingData = snapshot.val();
        const now = Date.now();
        // Consider typing if updated within last 3 seconds
        setOtherUserTyping(typingData.isTyping && (now - typingData.timestamp < 3000));
      } else {
        setOtherUserTyping(false);
      }
    });

    return () => unsubscribe();
  }, [selectedChat, user]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, otherUserTyping]);

  const openOrCreateChat = async (otherUserId: string, otherUsername: string, otherUserAvatar: string) => {
    if (!user) return;
    
    // Prevent self-messaging
    if (otherUserId === user.uid) {
      toast({
        title: "Error",
        description: "You cannot message yourself",
        variant: "destructive",
      });
      return;
    }

    const db = getDatabase();
    
    // Create a consistent chat ID (sorted user IDs)
    const chatId = [user.uid, otherUserId].sort().join('_');
    
    // Check if chat exists
    const chatRef = ref(db, `userChats/${user.uid}/${chatId}`);
    const snapshot = await get(chatRef);
    
    // Fetch the latest user data to get current avatars
    const otherUserRef = ref(db, `users/${otherUserId}`);
    const otherUserSnapshot = await get(otherUserRef);
    const otherUserData = otherUserSnapshot.val();
    const currentOtherUserAvatar = otherUserData?.photoURL || otherUserAvatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${otherUsername}`;
    
    const currentUserAvatar = user.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${username}`;
    
    if (!snapshot.exists()) {
      // Create new chat for both users
      await set(ref(db, `userChats/${user.uid}/${chatId}`), {
        otherUserId,
        otherUsername,
        otherUserAvatar: currentOtherUserAvatar,
        lastMessage: '',
        lastMessageTime: new Date().toISOString()
      });
      
      await set(ref(db, `userChats/${otherUserId}/${chatId}`), {
        otherUserId: user.uid,
        otherUsername: username,
        otherUserAvatar: currentUserAvatar,
        lastMessage: '',
        lastMessageTime: new Date().toISOString()
      });
    }
    
    setSelectedChat({
      chatId,
      otherUserId,
      otherUsername,
      otherUserAvatar: currentOtherUserAvatar,
      lastMessage: '',
      lastMessageTime: ''
    });
  };

  const handleTyping = async () => {
    if (!user || !selectedChat) return;

    const db = getDatabase();
    const typingRef = ref(db, `typing/${selectedChat.chatId}/${user.uid}`);
    
    // Set typing status
    await set(typingRef, {
      isTyping: true,
      timestamp: Date.now()
    });

    // Clear existing timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    // Stop typing after 2 seconds of inactivity
    typingTimeoutRef.current = setTimeout(async () => {
      await set(typingRef, {
        isTyping: false,
        timestamp: Date.now()
      });
    }, 2000);
  };

  const sendMessage = async () => {
    if (!user || !selectedChat) return;
    if (!messageText.trim() && !selectedFile) return;

    setIsUploading(true);
    try {
      const db = getDatabase();
      const messagesRef = ref(db, `messages/${selectedChat.chatId}`);
      const newMessageRef = push(messagesRef);
      
      let fileUrl = '';
      let fileName = '';
      let fileType = '';
      
      // Upload file if selected using Supabase S3
      if (selectedFile) {
        try {
          const fileExtension = selectedFile.name.split('.').pop() || 'file';
          const s3FileName = `${selectedChat.chatId}/${Date.now()}_${user.uid}.${fileExtension}`;
          
          fileUrl = await uploadToChatS3(selectedFile, s3FileName);
          fileName = selectedFile.name;
          fileType = selectedFile.type;
        } catch (uploadError: any) {
          console.error("Upload error:", uploadError);
          throw new Error("Failed to upload file. Please try again.");
        }
      }
      
      const messageData: any = {
        senderId: user.uid,
        text: messageText.trim() || (selectedFile ? `Sent ${selectedFile.type.startsWith('image/') ? 'an image' : 'a file'}` : ''),
        timestamp: new Date().toISOString()
      };
      
      if (fileUrl) {
        messageData.fileUrl = fileUrl;
        messageData.fileName = fileName;
        messageData.fileType = fileType;
      }
      
      // Add link preview if available
      if (linkPreview) {
        messageData.linkPreview = linkPreview;
      }
      
      await set(newMessageRef, messageData);
      
      // Update last message in both users' chat lists
      const lastMessage = messageText.trim() || (selectedFile ? `📎 ${fileName}` : '');
      await set(ref(db, `userChats/${user.uid}/${selectedChat.chatId}/lastMessage`), lastMessage);
      await set(ref(db, `userChats/${user.uid}/${selectedChat.chatId}/lastMessageTime`), messageData.timestamp);
      await set(ref(db, `userChats/${selectedChat.otherUserId}/${selectedChat.chatId}/lastMessage`), lastMessage);
      await set(ref(db, `userChats/${selectedChat.otherUserId}/${selectedChat.chatId}/lastMessageTime`), messageData.timestamp);
      
      // Clear typing indicator
      const typingRef = ref(db, `typing/${selectedChat.chatId}/${user.uid}`);
      await set(typingRef, {
        isTyping: false,
        timestamp: Date.now()
      });
      
      const sentMessageText = messageText.trim();
      setMessageText("");
      setSelectedFile(null);
      setFilePreview(null);
      setLinkPreview(null);
      
      // Check for @cognix mention and trigger AI response
      if (hasCognixMention(sentMessageText)) {
        handleCognixResponse(sentMessageText, selectedChat.chatId);
      }
    } catch (error: any) {
      console.error("Send message error:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to send message",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };
  
  // Handle Cognix AI response with streaming
  const handleCognixResponse = async (userMessage: string, chatId: string) => {
    setCognixTyping(true);
    setCognixStreamingMessage("");
    
    try {
      const db = getDatabase();
      const query = extractCognixQuery(userMessage);
      
      // Get recent messages for context
      const recentMessages = messages.slice(-5).map(msg => ({
        role: msg.senderId === COGNIX_USER.uid ? 'assistant' as const : 'user' as const,
        content: msg.text
      }));
      
      // Create placeholder message for streaming
      const messagesRef = ref(db, `messages/${chatId}`);
      const newMessageRef = push(messagesRef);
      const messageId = newMessageRef.key;
      setCognixMessageId(messageId);
      
      const timestamp = new Date().toISOString();
      
      // Set initial empty message
      await set(newMessageRef, {
        senderId: COGNIX_USER.uid,
        text: "",
        timestamp,
        isAI: true,
        isStreaming: true
      });
      
      setCognixTyping(false); // Hide typing, show streaming message
      
      // Stream the response
      await getCognixResponseStream(
        query || userMessage,
        recentMessages,
        // On each chunk
        (chunk) => {
          setCognixStreamingMessage(prev => prev + chunk);
        },
        // On complete
        async (fullResponse) => {
          // Update the message with final content
          await update(ref(db, `messages/${chatId}/${messageId}`), {
            text: fullResponse,
            isStreaming: false
          });
          
          // Update last message
          const lastMessagePreview = `🤖 ${fullResponse.slice(0, 30)}${fullResponse.length > 30 ? '...' : ''}`;
          await set(ref(db, `userChats/${user!.uid}/${chatId}/lastMessage`), lastMessagePreview);
          await set(ref(db, `userChats/${user!.uid}/${chatId}/lastMessageTime`), timestamp);
          
          if (selectedChat) {
            await set(ref(db, `userChats/${selectedChat.otherUserId}/${chatId}/lastMessage`), lastMessagePreview);
            await set(ref(db, `userChats/${selectedChat.otherUserId}/${chatId}/lastMessageTime`), timestamp);
          }
          
          setCognixStreamingMessage("");
          setCognixMessageId(null);
        },
        // On error
        async (errorMessage) => {
          await update(ref(db, `messages/${chatId}/${messageId}`), {
            text: errorMessage,
            isStreaming: false
          });
          
          setCognixStreamingMessage("");
          setCognixMessageId(null);
          
          toast({
            title: "Cognix Error",
            description: errorMessage,
            variant: "destructive",
          });
        }
      );
    } catch (error) {
      console.error("Error getting Cognix response:", error);
      toast({
        title: "Cognix Error",
        description: "Failed to get AI response",
        variant: "destructive",
      });
      setCognixTyping(false);
      setCognixStreamingMessage("");
      setCognixMessageId(null);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const processFile = (file: File) => {
    // Check file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      toast({
        title: "File Too Large",
        description: "Please select a file smaller than 10MB",
        variant: "destructive",
      });
      return;
    }

    setSelectedFile(file);
    
    // Create preview for images
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setFilePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    } else {
      setFilePreview(null);
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const file = items[i].getAsFile();
        if (file) {
          processFile(file);
          e.preventDefault();
        }
      }
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const file = e.dataTransfer.files[0];
    if (file) {
      processFile(file);
    }
  };

  const removeFile = () => {
    setSelectedFile(null);
    setFilePreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m`;
    if (diffHours < 24) return `${diffHours}h`;
    if (diffDays < 7) return `${diffDays}d`;
    return date.toLocaleDateString();
  };

  return (
    <div className="h-screen flex">
      {/* Left Sidebar - Chat List */}
      <div className="w-full md:w-96 border-r border-border flex flex-col">
        {/* Header */}
        <div className="border-b border-border p-4">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-xl font-semibold">{username}</h1>
          </div>
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 bg-secondary border-0 rounded-lg"
            />
          </div>
          <Button 
            className="w-full"
            variant="outline"
            onClick={() => toast({
              title: "Coming Soon",
              description: "Group chat feature will be available soon!",
            })}
          >
            <Users className="h-4 w-4 mr-2" />
            Create Group
          </Button>
        </div>

        {/* Chat List */}
        <ScrollArea className="flex-1">
          {isLoadingChats ? (
            <div className="py-20 text-center text-muted-foreground px-4">
              <div className="h-12 w-12 mx-auto mb-4 border-4 border-muted-foreground/20 border-t-muted-foreground rounded-full animate-spin" />
              <p className="text-sm">Loading chats...</p>
            </div>
          ) : chats.length === 0 ? (
            <div className="py-20 text-center text-muted-foreground px-4">
              <Send className="h-16 w-16 mx-auto mb-4 opacity-20" />
              <p className="text-lg font-semibold mb-2">Your Messages</p>
              <p className="text-sm">Send private messages to your friends</p>
            </div>
          ) : (
            <div>
              {chats.map((chat) => (
                <div
                  key={chat.chatId}
                  onClick={() => setSelectedChat(chat)}
                  className={`flex items-center gap-3 p-4 cursor-pointer hover:bg-secondary transition-colors ${
                    selectedChat?.chatId === chat.chatId ? 'bg-secondary' : ''
                  }`}
                >
                  <div className="relative">
                    <Avatar className="h-14 w-14">
                      <AvatarImage src={chat.otherUserAvatar} alt={chat.otherUsername} />
                      <AvatarFallback>{chat.otherUsername[0].toUpperCase()}</AvatarFallback>
                    </Avatar>
                    {chat.unreadCount && chat.unreadCount > 0 && (
                      <div className="absolute -top-1 -right-1 h-5 w-5 bg-blue-500 rounded-full flex items-center justify-center">
                        <span className="text-xs text-white font-semibold">
                          {chat.unreadCount > 9 ? '9+' : chat.unreadCount}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-sm">{chat.otherUsername}</p>
                      {chat.unreadCount && chat.unreadCount > 0 && (
                        <div className="h-2 w-2 bg-blue-500 rounded-full" />
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground truncate">
                      {chat.lastMessage || 'Start a conversation'}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    {chat.lastMessageTime && (
                      <span className="text-xs text-muted-foreground">
                        {formatTime(chat.lastMessageTime)}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </div>

      {/* Right Side - Chat Area */}
      <div className="flex-1 flex flex-col">
        {selectedChat ? (
          <>
            {/* Chat Header */}
            <div className="border-b border-border p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="md:hidden"
                  onClick={() => setSelectedChat(null)}
                >
                  <ArrowLeft className="h-5 w-5" />
                </Button>
                <Avatar 
                  className="h-10 w-10 cursor-pointer"
                  onClick={() => navigate(`/users/profile/${selectedChat.otherUsername}`)}
                >
                  <AvatarImage src={selectedChat.otherUserAvatar} alt={selectedChat.otherUsername} />
                  <AvatarFallback>{selectedChat.otherUsername[0].toUpperCase()}</AvatarFallback>
                </Avatar>
                <div>
                  <p 
                    className="font-semibold text-sm cursor-pointer hover:text-muted-foreground"
                    onClick={() => navigate(`/users/profile/${selectedChat.otherUsername}`)}
                  >
                    {selectedChat.otherUsername}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="icon">
                  <Phone className="h-5 w-5" />
                </Button>
                <Button variant="ghost" size="icon">
                  <Video className="h-5 w-5" />
                </Button>
                <Button variant="ghost" size="icon">
                  <Info className="h-5 w-5" />
                </Button>
              </div>
            </div>

            {/* Messages Area */}
            <ScrollArea 
              className="flex-1 p-4"
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => {
                setActiveReactionDetails(null);
                setActiveEmojiPicker(null);
                setActiveMessageMenu(null);
              }}
            >
              {isDragging && (
                <div className="absolute inset-0 bg-blue-500/10 border-2 border-dashed border-blue-500 rounded-lg flex items-center justify-center z-10">
                  <div className="text-center">
                    <ImageIcon className="h-16 w-16 mx-auto mb-2 text-blue-500" />
                    <p className="text-lg font-semibold">Drop file here</p>
                  </div>
                </div>
              )}
              <div className="flex flex-col gap-2">
                {/* Load More Button */}
                {hasMoreMessages && (
                  <div className="text-center py-2" ref={messagesTopRef}>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={loadMoreMessages}
                      disabled={isLoadingMore}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      {isLoadingMore ? (
                        <div className="flex items-center gap-2">
                          <div className="h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                          Loading...
                        </div>
                      ) : (
                        `Load older messages (${allMessagesData.length - displayedCount} more)`
                      )}
                    </Button>
                  </div>
                )}
                
                {messages.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <p>No messages yet</p>
                    <p className="text-sm mt-2">Start the conversation!</p>
                  </div>
                ) : (
                  messages.map((message) => (
                    <div
                      key={message.id}
                      className={`flex items-end gap-2 ${message.senderId === user?.uid ? 'flex-row-reverse' : 'flex-row'}`}
                      onMouseEnter={() => setHoveredMessage(message.id)}
                      onMouseLeave={() => setHoveredMessage(null)}
                    >
                      {/* Cognix AI Avatar */}
                      {message.senderId === COGNIX_USER.uid && (
                        <Avatar className="h-8 w-8 flex-shrink-0">
                          <AvatarImage src={COGNIX_USER.avatar} alt="Cognix" />
                          <AvatarFallback className="bg-indigo-500 text-white text-xs">AI</AvatarFallback>
                        </Avatar>
                      )}
                      
                      {/* Message bubble and reactions container */}
                      <div className={`flex flex-col max-w-[70%] ${message.senderId === user?.uid ? 'items-end' : 'items-start'}`}>
                        {/* Cognix AI Label */}
                        {message.senderId === COGNIX_USER.uid && (
                          <span className="text-xs text-indigo-400 font-medium mb-1 flex items-center gap-1">
                            <span>🤖</span> Cognix AI
                          </span>
                        )}
                        <div
                          className={`rounded-2xl px-4 py-2 ${
                            message.senderId === user?.uid
                              ? 'bg-blue-500 text-white'
                              : message.senderId === COGNIX_USER.uid
                              ? 'bg-gradient-to-r from-indigo-500/20 to-purple-500/20 border border-indigo-500/30'
                              : 'bg-secondary'
                          }`}
                        >
                          {/* Forwarded label */}
                          {message.forwarded && (
                            <div className={`flex items-center gap-1 mb-1 text-xs italic ${
                              message.senderId === user?.uid ? 'text-blue-200' : 'text-muted-foreground'
                            }`}>
                              <Forward className="h-3 w-3" />
                              <span>Forwarded</span>
                            </div>
                          )}
                          {/* Image files */}
                          {message.fileUrl && message.fileType?.startsWith('image/') && (
                            <img 
                              src={message.fileUrl} 
                              alt={message.fileName}
                              className="rounded-lg mb-2 max-w-[250px] max-h-[250px] object-cover cursor-pointer hover:opacity-90 transition-opacity"
                              onClick={() => setImagePreview(message.fileUrl!)}
                            />
                          )}
                          {/* Video files */}
                          {message.fileUrl && message.fileType?.startsWith('video/') && (
                            <VideoCard
                              fileUrl={message.fileUrl}
                              fileName={message.fileName || 'Video'}
                              isOwnMessage={message.senderId === user?.uid}
                            />
                          )}
                          {/* Audio files */}
                          {message.fileUrl && message.fileType?.startsWith('audio/') && (
                            <AudioCard
                              fileUrl={message.fileUrl}
                              fileName={message.fileName || 'Audio'}
                              isOwnMessage={message.senderId === user?.uid}
                            />
                          )}
                          {/* Document files (PDF, DOC, XLS, PPT, etc.) */}
                          {message.fileUrl && !message.fileType?.startsWith('image/') && !message.fileType?.startsWith('video/') && !message.fileType?.startsWith('audio/') && (
                            <DocumentCard
                              fileUrl={message.fileUrl}
                              fileName={message.fileName || 'Document'}
                              fileType={message.fileType || ''}
                              isOwnMessage={message.senderId === user?.uid}
                            />
                          )}
                          {/* Message text with markdown support */}
                          {(message.text || (message.id === cognixMessageId && cognixStreamingMessage)) && (
                            <div className="text-sm break-words max-w-[300px]">
                              <ChatMarkdown 
                                content={
                                  message.id === cognixMessageId && cognixStreamingMessage 
                                    ? cognixStreamingMessage 
                                    : message.text
                                }
                                isOwnMessage={message.senderId === user?.uid}
                              />
                              {message.id === cognixMessageId && cognixStreamingMessage && (
                                <span className="inline-block w-2 h-4 bg-indigo-400 ml-1 animate-pulse" />
                              )}
                            </div>
                          )}
                          <p className={`text-xs mt-1 ${
                            message.senderId === user?.uid 
                              ? 'text-blue-100' 
                              : message.senderId === COGNIX_USER.uid
                              ? 'text-indigo-300'
                              : 'text-muted-foreground'
                          }`}>
                            {formatTime(message.timestamp)}
                          </p>
                        </div>
                        
                        {/* Reactions display */}
                        {message.reactions && Object.keys(message.reactions).length > 0 && (
                          <div className="flex gap-1 mt-1 flex-wrap relative">
                            {Object.entries(
                              Object.values(message.reactions).reduce((acc: { [key: string]: { count: number; users: any[] } }, r: any) => {
                                if (!acc[r.emoji]) {
                                  acc[r.emoji] = { count: 0, users: [] };
                                }
                                acc[r.emoji].count += 1;
                                acc[r.emoji].users.push(r);
                                return acc;
                              }, {})
                            ).map(([emoji, data]) => (
                              <div key={emoji} className="relative">
                                <div 
                                  className="bg-secondary border border-border rounded-full px-2 py-0.5 text-sm flex items-center gap-1 cursor-pointer hover:bg-secondary/80"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setActiveEmojiPicker(null);
                                    setActiveReactionDetails(
                                      activeReactionDetails?.messageId === message.id && activeReactionDetails?.emoji === emoji 
                                        ? null 
                                        : { messageId: message.id, emoji }
                                    );
                                  }}
                                >
                                  <span>{emoji}</span>
                                  {(data as any).count > 1 && <span className="text-xs text-muted-foreground">{(data as any).count}</span>}
                                </div>
                                
                                {/* Reaction details popup */}
                                {activeReactionDetails?.messageId === message.id && activeReactionDetails?.emoji === emoji && (
                                  <div 
                                    className="absolute bottom-full mb-2 left-0 z-30 min-w-[150px]"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <div className="bg-background border border-border rounded-lg shadow-lg p-2">
                                      <div className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
                                        <span className="text-base">{emoji}</span>
                                        <span>Reactions</span>
                                      </div>
                                      <div className="space-y-1">
                                        {Object.entries(message.reactions!)
                                          .filter(([_, r]: [string, any]) => r.emoji === emoji)
                                          .map(([oderId, r]: [string, any]) => (
                                            <div 
                                              key={oderId}
                                              className={`flex items-center justify-between gap-2 p-1 rounded ${r.userId === user?.uid ? 'hover:bg-destructive/10 cursor-pointer' : ''}`}
                                              onClick={() => {
                                                if (r.userId === user?.uid) {
                                                  addReaction(message.id, emoji);
                                                  setActiveReactionDetails(null);
                                                }
                                              }}
                                            >
                                              <span className="text-sm truncate">{r.username}</span>
                                              {r.userId === user?.uid && (
                                                <X className="h-3 w-3 text-destructive flex-shrink-0" />
                                              )}
                                            </div>
                                          ))
                                        }
                                      </div>
                                    </div>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      
                      {/* Action buttons - show on hover */}
                      <div 
                        className={`flex items-center gap-1 relative ${hoveredMessage === message.id || activeEmojiPicker === message.id ? 'opacity-100' : 'opacity-0'} transition-opacity`}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button 
                          className="p-1.5 hover:bg-secondary rounded-full"
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveEmojiPicker(activeEmojiPicker === message.id ? null : message.id);
                            setActiveReactionDetails(null);
                          }}
                        >
                          <Smile className="h-4 w-4 text-muted-foreground" />
                        </button>
                        <button 
                          className="p-1.5 hover:bg-secondary rounded-full"
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveMessageMenu(activeMessageMenu === message.id ? null : message.id);
                            setActiveEmojiPicker(null);
                            setActiveReactionDetails(null);
                          }}
                        >
                          <MoreVertical className="h-4 w-4 text-muted-foreground" />
                        </button>
                        
                        {/* Message Menu */}
                        {activeMessageMenu === message.id && (
                          <div 
                            className="absolute bottom-full mb-2 right-0 z-20"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className="bg-background border border-border rounded-lg shadow-lg py-1 min-w-[140px]">
                              <button
                                className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-secondary transition-colors"
                                onClick={() => openForwardDialog(message)}
                              >
                                <Forward className="h-4 w-4" />
                                Forward
                              </button>
                              {message.senderId === user?.uid ? (
                                <button
                                  className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-secondary transition-colors text-destructive"
                                  onClick={() => unsendMessage(message.id)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                  Unsend
                                </button>
                              ) : (
                                <button
                                  className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-secondary transition-colors text-destructive"
                                  onClick={() => deleteMessageForMe(message.id)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                  Delete for me
                                </button>
                              )}
                            </div>
                          </div>
                        )}
                        
                        {/* Emoji Picker */}
                        {activeEmojiPicker === message.id && (
                          <div 
                            className="absolute bottom-full mb-2 z-20"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className="bg-background border border-border rounded-lg shadow-lg p-2 flex gap-1">
                              {QUICK_REACTIONS.map((emoji) => (
                                <button
                                  key={emoji}
                                  className="text-xl hover:bg-secondary p-1.5 rounded transition-colors"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    addReaction(message.id, emoji);
                                  }}
                                >
                                  {emoji}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                )}
                
                {/* Typing Indicator */}
                {otherUserTyping && (
                  <div className="flex justify-start">
                    <div className="bg-secondary rounded-2xl px-4 py-3">
                      <div className="flex gap-1">
                        <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                        <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                        <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                      </div>
                    </div>
                  </div>
                )}
                
                {/* Cognix AI Typing Indicator */}
                {cognixTyping && (
                  <div className="flex justify-start items-end gap-2">
                    <Avatar className="h-6 w-6">
                      <AvatarImage src={COGNIX_USER.avatar} alt="Cognix" />
                      <AvatarFallback className="bg-indigo-500 text-white text-xs">AI</AvatarFallback>
                    </Avatar>
                    <div className="bg-gradient-to-r from-indigo-500/20 to-purple-500/20 border border-indigo-500/30 rounded-2xl px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-indigo-400 font-medium">Cognix is thinking</span>
                        <div className="flex gap-1">
                          <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                          <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                          <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                        </div>
                      </div>
                    </div>
                  </div>
                )}
                
                <div ref={messagesEndRef} />
              </div>
            </ScrollArea>

            {/* Message Input */}
            <div className="border-t border-border p-4 relative">
              {/* GIF Picker */}
              {showGifPicker && (
                <div className="absolute bottom-full left-4 mb-2 w-[320px] bg-background border border-border rounded-lg shadow-lg z-30 max-h-[300px] flex flex-col">
                  <div className="p-2 border-b border-border">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-semibold text-sm">GIFs</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => setShowGifPicker(false)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="relative">
                      <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Search GIFs..."
                        value={gifSearchQuery}
                        onChange={(e) => setGifSearchQuery(e.target.value)}
                        className="pl-8 h-8 text-sm bg-secondary border-0"
                      />
                    </div>
                  </div>
                  <div className="flex-1 overflow-y-auto p-2">
                    {isLoadingGifs ? (
                      <div className="flex items-center justify-center py-6">
                        <div className="h-6 w-6 border-2 border-muted-foreground/20 border-t-muted-foreground rounded-full animate-spin" />
                      </div>
                    ) : gifs.length === 0 ? (
                      <div className="text-center py-6 text-muted-foreground text-sm">
                        <p>No GIFs found</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div className="grid grid-cols-3 gap-1">
                          {gifs.map((gif, index) => (
                            <img
                              key={`${gif.id}-${index}`}
                              src={gif.images.fixed_height.url}
                              alt={gif.title}
                              className="w-full h-[80px] object-cover rounded cursor-pointer hover:opacity-80 transition-opacity"
                              onClick={() => sendGif(gif)}
                              loading="lazy"
                            />
                          ))}
                        </div>
                        {hasMoreGifs && (
                          <button
                            onClick={loadMoreGifs}
                            disabled={isLoadingMoreGifs}
                            className="w-full py-2 text-xs text-blue-500 hover:text-blue-600 font-medium flex items-center justify-center gap-2"
                          >
                            {isLoadingMoreGifs ? (
                              <>
                                <div className="h-3 w-3 border-2 border-blue-500/20 border-t-blue-500 rounded-full animate-spin" />
                                Loading...
                              </>
                            ) : (
                              'Load More GIFs'
                            )}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="p-1 border-t border-border text-center">
                    <span className="text-[10px] text-muted-foreground">Powered by R8 GIF</span>
                  </div>
                </div>
              )}
              
              {selectedFile && (
                <div className="mb-3 p-3 bg-secondary rounded-lg flex items-center gap-3">
                  {filePreview ? (
                    <img src={filePreview} alt="Preview" className="h-16 w-16 object-cover rounded" />
                  ) : (
                    <div className="h-16 w-16 bg-muted rounded flex items-center justify-center">
                      <Paperclip className="h-6 w-6" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{selectedFile.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {(selectedFile.size / 1024).toFixed(1)} KB
                    </p>
                  </div>
                  <Button 
                    variant="ghost" 
                    size="icon"
                    onClick={removeFile}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              )}
              <div className="flex items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,.pdf,.doc,.docx,.txt"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                <Button 
                  variant="ghost" 
                  size="icon"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                  title="Attach file"
                >
                  <Paperclip className="h-5 w-5" />
                </Button>
                <Button 
                  variant="ghost" 
                  size="icon"
                  onClick={() => {
                    if (showGifPicker) {
                      // Closing - reset state
                      setShowGifPicker(false);
                      setGifSearchQuery("");
                    } else {
                      // Opening
                      setShowGifPicker(true);
                    }
                  }}
                  disabled={isUploading}
                  title="Send GIF"
                  className={showGifPicker ? "bg-secondary" : ""}
                >
                  <span className="text-sm font-bold">GIF</span>
                </Button>
                <Input
                  placeholder="Message..."
                  value={messageText}
                  onChange={(e) => {
                    setMessageText(e.target.value);
                    handleTyping();
                  }}
                  onKeyPress={handleKeyPress}
                  onPaste={handlePaste}
                  className="flex-1 border-0 bg-secondary rounded-full"
                  disabled={isUploading}
                />
                <Button 
                  variant="ghost" 
                  size="icon"
                  onClick={sendMessage}
                  disabled={(!messageText.trim() && !selectedFile) || isUploading}
                >
                  {isUploading ? (
                    <div className="h-5 w-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Send className="h-5 w-5" />
                  )}
                </Button>
              </div>
              
              {/* Link Preview */}
              {(linkPreview || isLoadingPreview) && (
                <div className="mt-3 p-3 bg-secondary rounded-lg">
                  {isLoadingPreview ? (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <div className="h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                      <span className="text-sm">Loading preview...</span>
                    </div>
                  ) : linkPreview && (
                    <div className="flex gap-3">
                      {linkPreview.image && (
                        <img 
                          src={linkPreview.image} 
                          alt={linkPreview.title || 'Link preview'}
                          className="w-16 h-16 object-cover rounded"
                          onError={(e) => (e.currentTarget.style.display = 'none')}
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
                          <ExternalLink className="h-3 w-3" />
                          <span className="truncate">{linkPreview.siteName || new URL(linkPreview.url).hostname}</span>
                        </div>
                        <p className="font-semibold text-sm truncate">{linkPreview.title || linkPreview.url}</p>
                        {linkPreview.description && (
                          <p className="text-xs text-muted-foreground line-clamp-2">{linkPreview.description}</p>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 flex-shrink-0"
                        onClick={() => setLinkPreview(null)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="w-24 h-24 mx-auto mb-6 rounded-full border-4 border-foreground flex items-center justify-center">
                <Send className="h-12 w-12" />
              </div>
              <h2 className="text-2xl font-light mb-2">Your messages</h2>
              <p className="text-muted-foreground mb-6">
                Send private messages to your friends
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Image Preview Modal */}
      {imagePreview && (
        <div 
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setImagePreview(null)}
        >
          <Button
            variant="ghost"
            size="icon"
            className="absolute top-4 right-4 text-white hover:bg-white/20"
            onClick={() => setImagePreview(null)}
          >
            <X className="h-6 w-6" />
          </Button>
          <img 
            src={imagePreview} 
            alt="Full size preview"
            className="max-w-full max-h-full object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      {/* Forward Message Dialog */}
      {showForwardDialog && messageToForward && (
        <div 
          className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
          onClick={() => {
            setShowForwardDialog(false);
            setMessageToForward(null);
          }}
        >
          <div 
            className="bg-background rounded-2xl w-full max-w-md max-h-[80vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h2 className="text-lg font-semibold">Forward to</h2>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  setShowForwardDialog(false);
                  setMessageToForward(null);
                }}
              >
                <X className="h-5 w-5" />
              </Button>
            </div>

            {/* Search */}
            <div className="p-4 border-b border-border">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search conversations..."
                  value={forwardSearchQuery}
                  onChange={(e) => setForwardSearchQuery(e.target.value)}
                  className="pl-10 bg-secondary border-0"
                />
              </div>
            </div>

            {/* Message Preview */}
            <div className="px-4 py-3 bg-secondary/50 border-b border-border">
              <p className="text-xs text-muted-foreground mb-1">Forwarding:</p>
              <div className="bg-background rounded-lg p-2 text-sm">
                {messageToForward.fileUrl && messageToForward.fileType?.startsWith('image/') && (
                  <img 
                    src={messageToForward.fileUrl} 
                    alt="Preview" 
                    className="w-16 h-16 object-cover rounded mb-1"
                  />
                )}
                {messageToForward.text ? (
                  <p className="truncate">{messageToForward.text}</p>
                ) : messageToForward.fileUrl ? (
                  <p className="text-muted-foreground">📎 {messageToForward.fileName || 'File'}</p>
                ) : null}
              </div>
            </div>

            {/* Chat List */}
            <div className="flex-1 overflow-y-auto">
              {filteredChatsForForward.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <p>No conversations found</p>
                </div>
              ) : (
                filteredChatsForForward.map((chat) => (
                  <button
                    key={chat.chatId}
                    className="w-full flex items-center gap-3 p-4 hover:bg-secondary transition-colors disabled:opacity-50"
                    onClick={() => forwardMessageToChat(chat)}
                    disabled={isForwarding}
                  >
                    <Avatar className="h-12 w-12">
                      <AvatarImage src={chat.otherUserAvatar} alt={chat.otherUsername} />
                      <AvatarFallback>{chat.otherUsername[0].toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 text-left">
                      <p className="font-semibold text-sm">{chat.otherUsername}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {chat.lastMessage || 'Start a conversation'}
                      </p>
                    </div>
                    {isForwarding && (
                      <div className="h-5 w-5 border-2 border-muted-foreground/20 border-t-muted-foreground rounded-full animate-spin" />
                    )}
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
