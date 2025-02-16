import React, { useEffect, useRef, useState } from "react";
import { Peer } from "peerjs";
import { DataConnection } from "peerjs";
import { nanoid } from "nanoid";
import { Message, FileMessage, PeerStatus } from "./types";
import { ChatMessage } from "./components/ChatMessage";
import { Send, Copy, Link, Code, FileUp, Search, Key } from "lucide-react";

// Constants for localStorage keys
const MESSAGES_STORAGE_KEY = "codeshare_messages";
const PEER_ID_STORAGE_KEY = "codeshare_peer_id";

function App() {
  const [peerId, setPeerId] = useState<string>("");
  const [customId, setCustomId] = useState("");
  const [targetId, setTargetId] = useState<string>("");
  const [connected, setConnected] = useState(false);
  const [messages, setMessages] = useState<Message[]>(() => {
    // Load messages from localStorage on initial render
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
  // const connRef = useRef<any>();
  const connRef = useRef<DataConnection | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const codeInputRef = useRef<HTMLTextAreaElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout>();
  const [showCodeInput, setShowCodeInput] = useState(false);
  const [showSearch, setShowSearch] = useState(false);

  // Save messages to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem(MESSAGES_STORAGE_KEY, JSON.stringify(messages));
  }, [messages]);

  // Load saved permanent ID from localStorage
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

    const peer = new Peer(id);
    peerRef.current = peer;

    peer.on("open", (id) => {
      setPeerId(id);
      setError("");
      if (idType === "permanent") {
        localStorage.setItem(PEER_ID_STORAGE_KEY, id);
      }
    });

    peer.on("error", (err) => {
      if (err.type === "unavailable-id") {
        setError("This ID is already taken. Please choose another one.");
      } else {
        setError("Connection error. Please try again.");
      }
    });

    peer.on("connection", (conn) => {
      connRef.current = conn;
      setupConnection(conn);
      setConnected(true);
    });
  };

  useEffect(() => {
    if (isTyping && connRef.current) {
      connRef.current.send({ type: "status", typing: true });
    }
  }, [isTyping]);

  const setupConnection = (conn: Peer.DataConnection) => {
    if (!conn.open) {
      console.error("Connection is not open yet, waiting...");
      conn.on("open", () => console.log("Connection established."));
      return;
    }

    conn.on("data", (data: Message | { type: "status"; typing?: boolean }) => {
      if ("type" in data && data.type === "status") {
        setPeerStatus((prev) => ({
          ...prev!,
          typing: data.typing ?? false,
          lastSeen: Date.now(),
        }));
        return;
      }

      setMessages((prev) => [...prev, data as Message]);
      conn.send({ type: "read", messageId: (data as Message).id });
    });

    conn.on("close", () => {
      console.log("Connection closed.");
      setConnected(false);
    });

    conn.on("error", (err) => {
      console.error("PeerJS Error:", err);
    });

    setPeerStatus({
      id: conn.peer,
      online: true,
      typing: false,
      lastSeen: Date.now(),
    });
  };

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
    if (!targetId.trim()) return;

    console.log("Attempting to connect to:", targetId);
    const conn = peerRef.current?.connect(targetId);

    if (conn) {
      console.log("Connection created:", conn);
      connRef.current = conn;
      setupConnection(conn);
      setConnected(true);
    } else {
      console.error("Connection failed");
    }
  };

  useEffect(() => {
    if (peerRef.current) {
      console.log("Peer ID:", peerRef.current.id);
    }
  }, [peerId]);

  const handleTyping = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputMessage(e.target.value);
    setIsTyping(true);

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    typingTimeoutRef.current = setTimeout(() => {
      setIsTyping(false);
      if (connRef.current) {
        connRef.current.send({ type: "status", typing: false });
      }
    }, 1000);
  };

  const handleReaction = (messageId: string, emoji: string) => {
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
      connRef.current.send({
        type: "reaction",
        messageId,
        reaction,
      });
    }
  };

  const sendMessage = (
    type: "text" | "code" | "file",
    content: string,
    extra?: Partial<Message>
  ) => {
    if (!connRef.current || !content.trim()) return;

    const message: Message = {
      id: nanoid(),
      type,
      content,
      sender: peerId,
      timestamp: Date.now(),
      ...extra,
    };

    if (!connRef.current) {
      console.error("No active connection!");
      return;
    }
    connRef.current.send(message);
    setMessages((prev) => [...prev, message]);
    setInputMessage("");
    setShowCodeInput(false);

    console.log("Sending message:", { type, content });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

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

      connRef.current?.send(message);
      setMessages((prev) => [...prev, message]);
    };

    if (file.type.startsWith("image/")) {
      reader.readAsDataURL(file);
    } else {
      reader.readAsDataURL(file);
    }
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
            <h1 className="text-2xl font-bold text-center mb-6">Chit-Chat</h1>

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
                <h1 className="font-semibold">Chit-Chat</h1>
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
                  >
                    <FileUp size={20} />
                  </button>
                  <button
                    onClick={() => sendMessage("text", inputMessage)}
                    className="p-2 bg-blue-500 text-white rounded-full hover:bg-blue-600"
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
