import React, { useState } from 'react';
import { Message, FileMessage, Reaction } from '../types';
import { Download, Check, CheckCheck, Smile } from 'lucide-react';
import SyntaxHighlighter from 'react-syntax-highlighter';
import { vs2015 } from 'react-syntax-highlighter/dist/esm/styles/hljs';

interface Props {
  message: Message;
  isOwn: boolean;
  onReaction: (messageId: string, reaction: string) => void;
}

const EMOJI_LIST = ['👍', '❤️', '😊', '🎉', '🚀', '👏'];

export const ChatMessage: React.FC<Props> = ({ message, isOwn, onReaction }) => {
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  const downloadFile = (content: string, filename: string) => {
    const link = document.createElement('a');
    link.href = content;
    link.download = filename || 'download';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const renderReactions = () => {
    if (!message.reactions?.length) return null;

    const reactionCount = message.reactions.reduce((acc, reaction) => {
      acc[reaction.emoji] = (acc[reaction.emoji] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return (
      <div className="flex gap-1 mt-1">
        {Object.entries(reactionCount).map(([emoji, count]) => (
          <span key={emoji} className="text-xs bg-gray-100 rounded-full px-2 py-1">
            {emoji} {count}
          </span>
        ))}
      </div>
    );
  };

  const renderEmojiPicker = () => {
    if (!showEmojiPicker) return null;

    return (
      <div className="absolute bottom-full mb-2 bg-white rounded-lg shadow-lg p-2 flex gap-1">
        {EMOJI_LIST.map((emoji) => (
          <button
            key={emoji}
            onClick={() => {
              onReaction(message.id, emoji);
              setShowEmojiPicker(false);
            }}
            className="hover:bg-gray-100 p-1 rounded"
          >
            {emoji}
          </button>
        ))}
      </div>
    );
  };

  const renderContent = () => {
    switch (message.type) {
      case 'text':
        return <p className="text-gray-800">{message.content}</p>;
      
      case 'code':
        return (
          <div className="max-w-full overflow-x-auto">
            <SyntaxHighlighter
              language={message.language || 'javascript'}
              style={vs2015}
              className="rounded-md text-sm"
            >
              {message.content}
            </SyntaxHighlighter>
          </div>
        );
      
      case 'file':
        const fileMsg = message as FileMessage;
        if (fileMsg.fileType.startsWith('image/')) {
          return (
            <div className="relative group">
              <img
                src={fileMsg.content}
                alt={fileMsg.filename}
                className="max-w-[200px] rounded-md"
              />
              <button
                onClick={() => downloadFile(fileMsg.content, fileMsg.filename!)}
                className="absolute top-2 right-2 bg-gray-800 bg-opacity-75 p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <Download size={16} className="text-white" />
              </button>
            </div>
          );
        }
        return (
          <div className="flex items-center gap-2 bg-gray-100 p-2 rounded-md">
            <span className="text-sm truncate flex-1">{fileMsg.filename}</span>
            <button
              onClick={() => downloadFile(fileMsg.content, fileMsg.filename!)}
              className="p-1 hover:bg-gray-200 rounded-full"
            >
              <Download size={16} />
            </button>
          </div>
        );
    }
  };

  return (
    <div className={`flex ${isOwn ? 'justify-end' : 'justify-start'} mb-4`}>
      <div
        className={`max-w-[80%] rounded-lg p-3 relative ${
          isOwn ? 'bg-blue-100' : 'bg-gray-100'
        }`}
      >
        {renderContent()}
        {renderReactions()}
        <div className="flex items-center justify-between mt-1">
          <div className="text-xs text-gray-500">
            {new Date(message.timestamp).toLocaleTimeString()}
          </div>
          <div className="flex items-center gap-2">
            {isOwn && (
              <span className="text-gray-500">
                {message.read ? <CheckCheck size={14} /> : <Check size={14} />}
              </span>
            )}
            <button
              onClick={() => setShowEmojiPicker(!showEmojiPicker)}
              className="text-gray-500 hover:text-gray-700"
            >
              <Smile size={14} />
            </button>
          </div>
        </div>
        {renderEmojiPicker()}
      </div>
    </div>
  );
};