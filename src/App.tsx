import React, { useEffect, useRef, useState } from "react";
import { Peer, DataConnection } from "peerjs";
import { nanoid } from "nanoid";
import { Message, FileMessage, PeerStatus } from "./types";
import { ChatMessage } from "./components/ChatMessage";
import { Send, Copy, Link, Code, FileUp, Search, Key } from "lucide-react";

const MESSAGES_STORAGE_KEY = "codeshare_messages";
const PEER_ID_STORAGE_KEY = "codeshare_peer_id";

const PEER_CONFIG = {
  config: {
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" },
      { urls: "stun:stun2.l.google.com:19302" },
      { urls: "stun:stun3.l.google.com:19302" },
      { urls: "stun:stun4.l.google.com:19302" },
      {
        urls: "turn:openrelay.metered.ca:80",
        username: "openrelayproject",
        credential: "openrelayproject",
      },
      {
        urls: "turn:openrelay.metered.ca:443",
        username: "openrelayproject",
        credential: "openrelayproject",
      },
    ],
  },
  debug: 1,
};

function App() {
  const [peerId, setPeerId] = useState<string>("");
  const [customId, setCustomId] = useState("");
  const [targetId, setTargetId] = useState<string>("");
  const [connected, setConnected] = useState(false);
  const [messages, setMessages] = useState<Message[]>(() => {
    const savedMessages = localStorage.getItem(MESSAGES_STORAGE_KEY);
    return savedMessages ? JSON.parse(savedMessages) : [];
  });
  const [inputMessage, setInputMessage] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [peerStatus, setPeerStatus] = useState<PeerStatus | null>(null);
  const [idType, setIdType] = useState<"temporary" | "permanent">("temporary");
  const [error, setError] = useState<string>("");
  const peerRef = useRef<Peer>();
  const connRef = useRef<DataConnection>();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const codeInputRef = useRef<HTMLTextAreaElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout>();
  const [showCodeInput, setShowCodeInput] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<string>("");
  const [isConnectionReady, setIsConnectionReady] = useState(false);

  useEffect(() => {
    localStorage.setItem(MESSAGES_STORAGE_KEY, JSON.stringify(messages));
  }, [messages]);

  useEffect(() => {
    const savedId = localStorage.getItem(PEER_ID_STORAGE_KEY);
    if (savedId) {
      setCustomId(savedId);
      setIdType("permanent");
    }
  }, []);

  useEffect(() => {
    if (idType === "temporary") {
      initializePeer(nanoid(10));
    }
  }, [idType]);

  const initializePeer = (id: string) => {
    if (peerRef.current) {
      peerRef.current.destroy();
    }

    setConnectionStatus("Initializing connection...");
    setIsConnectionReady(false);

    const peer = new Peer(id, PEER_CONFIG);
    peerRef.current = peer;

    peer.on("open", (id) => {
      console.log("Peer open with ID:", id);
      setPeerId(id);
      setError("");
      setConnectionStatus("Ready to connect");
      if (idType === "permanent") {
        localStorage.setItem(PEER_ID_STORAGE_KEY, id);
      }
    });

    peer.on("error", (err) => {
      console.error("PeerJS error:", err);
      if (err.type === "unavailable-id") {
        setError("This ID is already taken. Please choose another one.");
      } else if (err.type === "peer-unavailable") {
        setError("Peer is not available. Please check the ID and try again.");
      } else if (err.type === "disconnected") {
        setError("Connection lost. Trying to reconnect...");
        peer.reconnect();
      } else {
        setError("Connection error. Please try again.");
      }
      setConnectionStatus("Connection error");
      setIsConnectionReady(false);
    });

    peer.on("connection", (conn) => {
      console.log("Incoming connection from:", conn.peer);
      setupConnection(conn);
    });

    peer.on("disconnected", () => {
      setConnectionStatus("Disconnected. Trying to reconnect...");
      setIsConnectionReady(false);
      peer.reconnect();
    });
  };

  const setupConnection = (conn: DataConnection) => {
    if (connRef.current) {
      connRef.current.close();
    }

    connRef.current = conn;
    setConnectionStatus("Connecting...");

    conn.on("open", () => {
      console.log("Connection opened with:", conn.peer);
      setConnected(true);
      setIsConnectionReady(true);
      setConnectionStatus("Connected");
      setPeerStatus({
        id: conn.peer,
        online: true,
        typing: false,
        lastSeen: Date.now(),
      });
    });

    conn.on("data", (data: Message | { type: "status"; typing?: boolean }) => {
      if (data.type === "status") {
        setPeerStatus((prev) => ({
          ...prev!,
          typing: data.typing,
          lastSeen: Date.now(),
        }));
        return;
      }

      setMessages((prev) => [...prev, data]);
      conn.send({ type: "read", messageId: data.id });
    });

    conn.on("close", () => {
      console.log("Connection closed");
      setConnected(false);
      setIsConnectionReady(false);
      connRef.current = undefined;
      setPeerStatus((prev) => (prev ? { ...prev, online: false } : null));
      setConnectionStatus("Connection closed");
    });

    conn.on("error", (err) => {
      console.error("Connection error:", err);
      setError("Connection error. Please try reconnecting.");
      setConnectionStatus("Connection error");
      setIsConnectionReady(false);
    });
  };

  useEffect(() => {
    if (isTyping && connRef.current && isConnectionReady) {
      connRef.current.send({ type: "status", typing: true });
    }
  }, [isTyping, isConnectionReady]);

  const handlePermanentIdSubmit = () => {
    if (!customId.trim()) {
      setError("Please enter an ID");
      return;
    }

    if (customId.length < 4) {
      setError("ID must be at least 4 characters long");
      return;
    }

    initializePeer(customId);
  };

  const connect = () => {
    if (!targetId.trim() || !peerRef.current) return;

    setConnectionStatus("Connecting...");
    const conn = peerRef.current.connect(targetId, {
      reliable: true,
      serialization: "json",
    });

    setupConnection(conn);
  };

  const handleTyping = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputMessage(e.target.value);
    setIsTyping(true);

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    typingTimeoutRef.current = setTimeout(() => {
      setIsTyping(false);
      if (connRef.current && isConnectionReady) {
        connRef.current.send({ type: "status", typing: false });
      }
    }, 1000);
  };

  const handleReaction = (messageId: string, emoji: string) => {
    if (!isConnectionReady) {
      setError("Connection not ready. Please wait.");
      return;
    }

    const reaction = {
      emoji,
      user: peerId,
    };

    setMessages((prev) =>
      prev.map((msg) => {
        if (msg.id === messageId) {
          return {
            ...msg,
            reactions: [...(msg.reactions || []), reaction],
          };
        }
        return msg;
      })
    );

    if (connRef.current) {
      try {
        connRef.current.send({
          type: "reaction",
          messageId,
          reaction,
        });
      } catch (err) {
        console.error("Error sending reaction:", err);
      }
    }
  };

  const sendMessage = (
    type: "text" | "code" | "file",
    content: string,
    extra?: Partial<Message>
  ) => {
    if (!connRef.current || !content.trim() || !isConnectionReady) {
      if (!isConnectionReady) {
        setError("Connection not ready. Please wait.");
      }
      return;
    }

    const message: Message = {
      id: nanoid(),
      type,
      content,
      sender: peerId,
      timestamp: Date.now(),
      ...extra,
    };

    try {
      connRef.current.send(message);
      setMessages((prev) => [...prev, message]);
      setInputMessage("");
      setShowCodeInput(false);
    } catch (err) {
      console.error("Error sending message:", err);
      setError("Failed to send message. Please try again.");
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!isConnectionReady) {
      setError("Connection not ready. Please wait.");
      return;
    }

    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      setError("File size must be less than 5MB");
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      const message: FileMessage = {
        id: nanoid(),
        type: "file",
        content,
        filename: file.name,
        fileType: file.type,
        fileSize: file.size,
        sender: peerId,
        timestamp: Date.now(),
      };

      try {
        if (connRef.current && isConnectionReady) {
          connRef.current.send(message);
          setMessages((prev) => [...prev, message]);
        } else {
          setError("Connection not ready. Please wait.");
        }
      } catch (err) {
        console.error("Error sending file:", err);
        setError("Failed to send file. Please try again.");
      }
    };

    reader.onerror = () => {
      setError("Error reading file. Please try again.");
    };

    reader.readAsDataURL(file);
  };

  const copyPeerId = () => {
    navigator.clipboard.writeText(peerId);
  };

  const clearChatHistory = () => {
    setMessages([]);
    localStorage.removeItem(MESSAGES_STORAGE_KEY);
  };

  const filteredMessages = searchQuery
    ? messages.filter(
        (msg) =>
          msg.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
          msg.filename?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : messages;

  return (
    <div className="min-h-screen bg-gray-100 p-4">
      <div className="max-w-3xl mx-auto bg-white rounded-lg shadow-md overflow-hidden">
        {!connected ? (
          <div className="p-6">
            <h1 className="text-2xl font-bold text-center mb-6">CodeShare</h1>

            <div className="mb-6">
              <div className="flex gap-4 mb-4">
                <button
                  onClick={() => setIdType("temporary")}
                  className={`flex-1 py-2 px-4 rounded-md ${
                    idType === "temporary"
                      ? "bg-blue-500 text-white"
                      : "bg-gray-100 text-gray-700"
                  }`}
                >
                  Temporary ID
                </button>
                <button
                  onClick={() => setIdType("permanent")}
                  className={`flex-1 py-2 px-4 rounded-md ${
                    idType === "permanent"
                      ? "bg-blue-500 text-white"
                      : "bg-gray-100 text-gray-700"
                  }`}
                >
                  Permanent ID
                </button>
              </div>

              {connectionStatus && (
                <div className="text-sm text-gray-600 mb-4 text-center">
                  {connectionStatus}
                </div>
              )}

              {idType === "permanent" ? (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Create your permanent ID:
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={customId}
                        onChange={(e) => setCustomId(e.target.value)}
                        placeholder="Enter your custom ID"
                        className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm"
                      />
                      <button
                        onClick={handlePermanentIdSubmit}
                        className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600"
                      >
                        <Key size={16} />
                      </button>
                    </div>
                    {error && (
                      <p className="text-red-500 text-sm mt-1">{error}</p>
                    )}
                  </div>
                </div>
              ) : (
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700">
                    Your temporary ID:
                  </label>
                  <div className="mt-1 flex rounded-md shadow-sm">
                    <input
                      type="text"
                      value={peerId}
                      readOnly
                      className="flex-1 rounded-l-md border border-gray-300 px-3 py-2 text-sm"
                    />
                    <button
                      onClick={copyPeerId}
                      className="inline-flex items-center px-4 py-2 border border-l-0 border-gray-300 rounded-r-md bg-gray-50 hover:bg-gray-100"
                    >
                      <Copy size={16} />
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700">
                Connect to:
              </label>
              <div className="mt-1 flex rounded-md shadow-sm">
                <input
                  type="text"
                  value={targetId}
                  onChange={(e) => setTargetId(e.target.value)}
                  placeholder="Enter peer ID"
                  className="flex-1 rounded-l-md border border-gray-300 px-3 py-2 text-sm"
                />
                <button
                  onClick={connect}
                  className="inline-flex items-center px-4 py-2 border border-l-0 border-gray-300 rounded-r-md bg-gray-50 hover:bg-gray-100"
                >
                  <Link size={16} />
                </button>
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className="bg-white border-b px-4 py-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h1 className="font-semibold">CodeShare</h1>
                {peerStatus && (
                  <div className="text-sm text-gray-500">
                    {peerStatus.typing ? (
                      <span className="text-blue-500">typing...</span>
                    ) : (
                      <span>{peerStatus.online ? "online" : "offline"}</span>
                    )}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={clearChatHistory}
                  className="text-sm text-red-500 hover:text-red-600"
                >
                  Clear History
                </button>
                <button
                  onClick={() => setShowSearch(!showSearch)}
                  className="p-2 text-gray-500 hover:bg-gray-100 rounded-full"
                >
                  <Search size={20} />
                </button>
              </div>
            </div>
            {showSearch && (
              <div className="p-2 border-b">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search messages..."
                  className="w-full px-3 py-2 border rounded-md text-sm"
                />
              </div>
            )}
            <div className="h-[500px] overflow-y-auto p-4 bg-white">
              {filteredMessages.map((msg) => (
                <ChatMessage
                  key={msg.id}
                  message={msg}
                  isOwn={msg.sender === peerId}
                  onReaction={handleReaction}
                />
              ))}
            </div>
            <div className="border-t p-4">
              {error && (
                <div className="text-red-500 text-sm mb-2">{error}</div>
              )}
              {showCodeInput ? (
                <div className="mb-4">
                  <textarea
                    ref={codeInputRef}
                    className="w-full h-32 p-2 border rounded-md font-mono text-sm"
                    placeholder="Paste your code here..."
                  />
                  <div className="flex justify-end gap-2 mt-2">
                    <button
                      onClick={() => setShowCodeInput(false)}
                      className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-md"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => {
                        const code = codeInputRef.current?.value;
                        if (code) {
                          sendMessage("code", code, { language: "javascript" });
                        }
                      }}
                      className="px-4 py-2 text-sm bg-blue-500 text-white rounded-md hover:bg-blue-600"
                      disabled={!isConnectionReady}
                    >
                      Send Code
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={inputMessage}
                    onChange={handleTyping}
                    onKeyPress={(e) =>
                      e.key === "Enter" && sendMessage("text", inputMessage)
                    }
                    placeholder="Type a message..."
                    className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm"
                  />
                  <button
                    onClick={() => setShowCodeInput(true)}
                    className="p-2 text-gray-500 hover:bg-gray-100 rounded-full"
                    disabled={!isConnectionReady}
                  >
                    <Code size={20} />
                  </button>
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="p-2 text-gray-500 hover:bg-gray-100 rounded-full"
                    disabled={!isConnectionReady}
                  >
                    <FileUp size={20} />
                  </button>
                  <button
                    onClick={() => sendMessage("text", inputMessage)}
                    className={`p-2 rounded-full ${
                      isConnectionReady
                        ? "bg-blue-500 text-white hover:bg-blue-600"
                        : "bg-gray-300 text-gray-500 cursor-not-allowed"
                    }`}
                    disabled={!isConnectionReady}
                  >
                    <Send size={20} />
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default App;
