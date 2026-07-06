"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  Send, Bot, User, Sparkles, Paperclip, FileText, X,
  ChevronLeft, ChevronRight, Plus, Search, Settings, Info,
  MessageSquare, Trash2, Loader2, LogOut,
  Users, Link2, ChevronDown, UserMinus, UserPlus, Copy
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import { useRouter } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { getToken, clearToken, getUserInfo, exchangeSocialToken } from "@/lib/auth";

const API = () => `http://${window.location.hostname}:8000`;

type Message = {
  id: string;
  role: "user" | "agent";
  content: string;
};

type Conversation = {
  id: number;
  title: string;
  updated_at: string;
};

type GroupMember = {
  email: string;
  name: string;
  isCreator?: boolean;
};

type GroupChatEntry = {
  id: string;
  role: "user" | "system";
  content: string;
  senderName?: string;
  senderEmail?: string;
  timestamp: string;
};

type GroupChat = {
  id: string;
  name: string;
  createdAt: string;
  creatorEmail: string;
  creatorName: string;
  members: GroupMember[];
  messages: GroupChatEntry[];
  inviteLink: string;
};

export default function ChatInterface() {
  const router = useRouter();
  const { data: session, status: sessionStatus } = useSession();

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  // User info
  const [userEmail, setUserEmail] = useState("");
  const [userName, setUserName] = useState("");
  const [isAuthReady, setIsAuthReady] = useState(false);

  // Conversations
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Group Chats
  const [groupChats, setGroupChats] = useState<GroupChat[]>([]);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [gcInput, setGcInput] = useState("");

  // UI State
  const [showNewChatMenu, setShowNewChatMenu] = useState(false);
  const [showCreateGcDialog, setShowCreateGcDialog] = useState(false);
  const [newGcName, setNewGcName] = useState("");
  const [showChatSettings, setShowChatSettings] = useState(false);
  const [showPeopleDialog, setShowPeopleDialog] = useState(false);
  const [showInviteDialog, setShowInviteDialog] = useState(false);
  const [showHeaderNewChatMenu, setShowHeaderNewChatMenu] = useState(false);
  const [addMemberEmail, setAddMemberEmail] = useState("");
  const [addMemberName, setAddMemberName] = useState("");
  const [copiedLink, setCopiedLink] = useState(false);

  const isNewChat = messages.length === 0;
  const activeGroup = groupChats.find(g => g.id === activeGroupId) ?? null;
  const isGroupView = !!activeGroupId;

  // ─── Auth Check ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (sessionStatus === "loading") return;

    const initAuth = async () => {
      // Check for NextAuth session (social login)
      if (session?.user?.email) {
        let token = getToken();
        if (!token) {
          token = await exchangeSocialToken(session.user.email, session.user.name ?? undefined);
        }
        if (!token) { router.push("/login"); return; }
        setUserEmail(session.user.email);
        setUserName(session.user.name || "Operative");
        setIsAuthReady(true);
        return;
      }

      // Check for JWT (email/password login)
      const token = getToken();
      if (!token) { router.push("/login"); return; }
      const info = getUserInfo();
      setUserEmail(info.email);
      setUserName(info.name || "Operative");
      setIsAuthReady(true);
    };

    initAuth();
  }, [session, sessionStatus, router]);

  // ─── Load conversations ────────────────────────────────────────────────────
  const loadConversations = useCallback(async () => {
    if (!userEmail) return;
    try {
      const res = await fetch(`${API()}/conversations/${encodeURIComponent(userEmail)}`);
      if (res.ok) setConversations(await res.json());
    } catch { }
  }, [userEmail]);

  useEffect(() => {
    if (isAuthReady) loadConversations();
  }, [isAuthReady, loadConversations]);

  // ─── Auto-scroll ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  // ─── Load a conversation ───────────────────────────────────────────────────
  const loadConversation = async (conv: Conversation) => {
    setActiveConvId(conv.id);
    setMessages([]);
    try {
      const res = await fetch(`${API()}/conversations/${conv.id}/messages`);
      if (res.ok) {
        const msgs = await res.json();
        setMessages(msgs.map((m: any) => ({ id: String(m.id), role: m.role, content: m.content })));
      }
    } catch { }
  };

  // ─── Create a new conversation ─────────────────────────────────────────────
  const startNewChat = () => {
    setActiveConvId(null);
    setMessages([]);
    setInput("");
    setAttachedFile(null);
  };

  const deleteConversation = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    await fetch(`${API()}/conversations/${id}`, { method: "DELETE" });
    setConversations((prev) => prev.filter((c) => c.id !== id));
    if (activeConvId === id) startNewChat();
  };

  // ─── Send message ──────────────────────────────────────────────────────────
  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if ((!input.trim() && !attachedFile) || isLoading) return;

    let messageContent = input.trim();
    if (attachedFile) {
      messageContent += messageContent ? `\n[Attached: ${attachedFile.name}]` : `[Attached: ${attachedFile.name}]`;
    }

    const userMsg: Message = { id: Date.now().toString(), role: "user", content: messageContent };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    const currentFile = attachedFile;
    setAttachedFile(null);
    setIsLoading(true);

    let convId = activeConvId;

    try {
      // Create a new conversation on first message
      if (!convId) {
        const title = messageContent.slice(0, 50) + (messageContent.length > 50 ? "…" : "");
        const res = await fetch(`${API()}/conversations`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ user_email: userEmail, title }),
        });
        if (res.ok) {
          const newConv = await res.json();
          convId = newConv.id;
          setActiveConvId(convId);
          setConversations((prev) => [newConv, ...prev]);
        }
      }

      // Persist user message
      if (convId) {
        await fetch(`${API()}/conversations/${convId}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role: "user", content: messageContent }),
        });
      }

      // Call the agent
      const formData = new FormData();
      formData.append("request_Message", messageContent);
      formData.append("user_email", userEmail);
      if (currentFile) formData.append("request_file", currentFile);

      const token = getToken();
      const response = await fetch(`${API()}/chat`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      if (response.status === 401) { clearToken(); router.push("/login"); return; }
      if (!response.ok) throw new Error("Agent error");

      const data = await response.json();
      const agentMsg: Message = { id: (Date.now() + 1).toString(), role: "agent", content: data.response };
      setMessages((prev) => [...prev, agentMsg]);

      // Persist agent message
      if (convId) {
        await fetch(`${API()}/conversations/${convId}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role: "agent", content: data.response }),
        });
      }

      // Update conversation's updated_at in sidebar
      loadConversations();
    } catch (error) {
      setMessages((prev) => [...prev, { id: (Date.now() + 1).toString(), role: "agent", content: "Sorry, I encountered an error. Please try again." }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = async () => {
    clearToken();
    if (session) await signOut({ callbackUrl: "/login" });
    else router.push("/login");
  };

  // ─── Group Chat Handlers ───────────────────────────────────────────────────
  const createGroupChat = () => {
    if (!newGcName.trim()) return;
    const now = new Date().toISOString();
    const id = `gc-${Date.now()}`;
    const inviteLink = `${window.location.origin}/join/${id}`;
    const systemMsg: GroupChatEntry = {
      id: `sys-${Date.now()}`,
      role: "system",
      content: `"${newGcName.trim()}" created by ${userName}`,
      timestamp: now,
    };
    const newGroup: GroupChat = {
      id,
      name: newGcName.trim(),
      createdAt: now,
      creatorEmail: userEmail,
      creatorName: userName,
      inviteLink,
      members: [{ email: userEmail, name: userName, isCreator: true }],
      messages: [systemMsg],
    };
    setGroupChats(prev => [newGroup, ...prev]);
    setActiveGroupId(id);
    setActiveConvId(null);
    setMessages([]);
    setNewGcName("");
    setShowCreateGcDialog(false);
  };

  const sendGroupMessage = () => {
    if (!gcInput.trim() || !activeGroupId) return;
    const now = new Date().toISOString();
    const entry: GroupChatEntry = {
      id: `msg-${Date.now()}`,
      role: "user",
      content: gcInput.trim(),
      senderName: userName,
      senderEmail: userEmail,
      timestamp: now,
    };
    setGroupChats(prev => prev.map(g =>
      g.id === activeGroupId ? { ...g, messages: [...g.messages, entry] } : g
    ));
    setGcInput("");
  };

  const leaveGroupChat = () => {
    if (!activeGroupId || !activeGroup) return;
    const now = new Date().toISOString();
    const leaveMsg: GroupChatEntry = {
      id: `sys-${Date.now()}`,
      role: "system",
      content: `${userName} left the group`,
      timestamp: now,
    };
    setGroupChats(prev => prev.map(g =>
      g.id === activeGroupId
        ? { ...g, members: g.members.filter(m => m.email !== userEmail), messages: [...g.messages, leaveMsg] }
        : g
    ));
    setActiveGroupId(null);
    setShowChatSettings(false);
  };

  const deleteGroupChat = () => {
    if (!activeGroupId) return;
    setGroupChats(prev => prev.filter(g => g.id !== activeGroupId));
    setActiveGroupId(null);
    setShowChatSettings(false);
  };

  const addGroupMember = () => {
    if (!addMemberEmail.trim() || !activeGroupId) return;
    const now = new Date().toISOString();
    const newMember: GroupMember = { email: addMemberEmail.trim(), name: addMemberName.trim() || addMemberEmail.trim() };
    const joinMsg: GroupChatEntry = {
      id: `sys-${Date.now()}`,
      role: "system",
      content: `${newMember.name} joined the chat`,
      timestamp: now,
    };
    setGroupChats(prev => prev.map(g =>
      g.id === activeGroupId
        ? { ...g, members: [...g.members, newMember], messages: [...g.messages, joinMsg] }
        : g
    ));
    setAddMemberEmail("");
    setAddMemberName("");
  };

  const removeGroupMember = (email: string) => {
    if (!activeGroupId) return;
    setGroupChats(prev => prev.map(g =>
      g.id === activeGroupId
        ? { ...g, members: g.members.filter(m => m.email !== email) }
        : g
    ));
  };

  const openGroupChat = (g: GroupChat) => {
    setActiveGroupId(g.id);
    setActiveConvId(null);
    setMessages([]);
  };

  const formatTs = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  // ─── Filter conversations ──────────────────────────────────────────────────
  const filteredConversations = conversations.filter((c) =>
    c.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return d.toLocaleDateString([], { weekday: "short" });
    return d.toLocaleDateString([], { month: "short", day: "numeric" });
  };

  if (!isAuthReady) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <Loader2 className="w-12 h-12 text-[#E2FF00] animate-spin" />
      </div>
    );
  }

  return (
    <main className="h-screen w-full flex flex-row bg-[#000000] overflow-hidden font-sans text-white relative">
      {/* Mobile Sidebar Overlay */}
      {isSidebarOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-30 md:hidden" onClick={() => setIsSidebarOpen(false)} />
      )}

      {/* ─── Left Sidebar ──────────────────────────────────────────────────── */}
      <aside className={`${isSidebarOpen ? "w-[85vw] md:w-[280px] border-r-4 p-4" : "w-0 border-r-0 p-0"} bg-[#E2FF00] text-black flex flex-col absolute md:relative h-full z-40 transition-all duration-300 ease-in-out overflow-hidden shrink-0`}>
        {isSidebarOpen && (
          <div className="flex flex-col h-full whitespace-nowrap overflow-hidden opacity-100 relative z-10">
            {/* Brand */}
            <div className="flex items-center gap-3 mb-5">
              <div className="flex items-center justify-center w-10 h-10 bg-black text-[#E2FF00] border-2 border-black shrink-0">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-2xl font-black tracking-tighter uppercase italic leading-none">SERVIX</h1>
                <p className="text-[10px] font-bold tracking-widest uppercase opacity-60">AI SYS // V1.0</p>
              </div>
            </div>

            {/* New Chat Dropdown */}
            <div className="relative mb-4">
              <div className="flex border-2 border-black shadow-[2px_2px_0px_#000]">
                <button
                  onClick={() => { startNewChat(); setActiveGroupId(null); }}
                  className="flex-1 flex items-center gap-3 px-4 py-3 bg-black text-[#E2FF00] font-bold uppercase tracking-widest text-sm hover:bg-white hover:text-black transition-colors active:translate-y-0.5"
                >
                  <Plus className="w-4 h-4 shrink-0" /> New Chat
                </button>
                <button
                  onClick={() => setShowNewChatMenu(v => !v)}
                  className="px-3 bg-black text-[#E2FF00] border-l-2 border-[#E2FF00]/30 hover:bg-white hover:text-black transition-colors"
                >
                  <ChevronDown className="w-4 h-4" />
                </button>
              </div>
              {showNewChatMenu && (
                <div className="absolute left-0 right-0 top-full z-50 bg-black border-2 border-[#E2FF00] shadow-[4px_4px_0px_#E2FF00]">
                  <button
                    onClick={() => { startNewChat(); setActiveGroupId(null); setShowNewChatMenu(false); }}
                    className="w-full flex items-center gap-3 px-4 py-3 text-[#E2FF00] font-bold uppercase tracking-widest text-xs hover:bg-[#E2FF00] hover:text-black transition-colors"
                  >
                    <MessageSquare className="w-4 h-4" /> New Chat
                  </button>
                  <button
                    onClick={() => { setShowCreateGcDialog(true); setShowNewChatMenu(false); }}
                    className="w-full flex items-center gap-3 px-4 py-3 text-[#E2FF00] font-bold uppercase tracking-widest text-xs hover:bg-[#E2FF00] hover:text-black transition-colors border-t border-[#E2FF00]/20"
                  >
                    <Users className="w-4 h-4" /> New Group Chat
                  </button>
                </div>
              )}
            </div>

            {/* Search */}
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-black/50 z-10" />
              <input
                type="text"
                placeholder="Search chats..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-black/10 border-2 border-black text-black placeholder:text-black/40 placeholder:font-bold placeholder:tracking-widest rounded-none pl-9 pr-3 py-2 text-sm font-mono focus:outline-none focus:bg-black/20"
              />
            </div>

            {/* Conversation List */}
            <div className="flex-1 overflow-y-auto space-y-1 pr-1 custom-scrollbar-dark">
              {filteredConversations.length === 0 && (
                <div className="text-center py-8 text-black/50 text-xs font-bold uppercase tracking-widest">
                  {searchQuery ? "No results" : "No chats yet"}
                </div>
              )}
              {filteredConversations.map((conv) => (
                <div
                  key={conv.id}
                  onClick={() => loadConversation(conv)}
                  className={`group flex items-center gap-2 px-3 py-2.5 cursor-pointer border-2 transition-all ${activeConvId === conv.id ? "bg-black text-[#E2FF00] border-black" : "bg-transparent border-transparent hover:bg-black/10 hover:border-black/30"}`}
                >
                  <MessageSquare className={`w-4 h-4 shrink-0 ${activeConvId === conv.id ? "text-[#E2FF00]" : "text-black"}`} />
                  <div className="flex-1 min-w-0">
                    <p className={`text-xs font-bold uppercase truncate ${activeConvId === conv.id ? "text-[#E2FF00]" : "text-black"}`}>
                      {conv.title}
                    </p>
                    <p className={`text-[10px] font-mono ${activeConvId === conv.id ? "text-[#E2FF00]/60" : "text-black/50"}`}>
                      {formatDate(conv.updated_at)}
                    </p>
                  </div>
                  <button
                    onClick={(e) => deleteConversation(conv.id, e)}
                    className="opacity-0 group-hover:opacity-100 p-1 hover:text-red-500 transition-all"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>

            {/* ── Group Chats Section ─────────────────────────────── */}
            <div className="mt-3 mb-1 flex items-center gap-2">
              <Users className="w-3.5 h-3.5 text-black/60" />
              <span className="text-[10px] font-black uppercase tracking-widest text-black/60">Group Chats</span>
              <div className="flex-1 h-px bg-black/20" />
            </div>
            <div className="overflow-y-auto space-y-1 pr-1 custom-scrollbar-dark" style={{ maxHeight: "160px" }}>
              {groupChats.length === 0 && (
                <div className="text-center py-3 text-black/40 text-[10px] font-bold uppercase tracking-widest">No group chats yet</div>
              )}
              {groupChats.map(g => (
                <div
                  key={g.id}
                  onClick={() => openGroupChat(g)}
                  className={`group flex items-center gap-2 px-3 py-2.5 cursor-pointer border-2 transition-all ${activeGroupId === g.id ? "bg-black text-[#E2FF00] border-black" : "bg-transparent border-transparent hover:bg-black/10 hover:border-black/30"
                    }`}
                >
                  <Users className={`w-4 h-4 shrink-0 ${activeGroupId === g.id ? "text-[#E2FF00]" : "text-black"}`} />
                  <div className="flex-1 min-w-0">
                    <p className={`text-xs font-bold uppercase truncate ${activeGroupId === g.id ? "text-[#E2FF00]" : "text-black"}`}>{g.name}</p>
                    <p className={`text-[10px] font-mono ${activeGroupId === g.id ? "text-[#E2FF00]/60" : "text-black/50"}`}>{g.members.length} member{g.members.length !== 1 ? "s" : ""}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4 pt-4 border-t-2 border-black/20">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-8 h-8 bg-black text-[#E2FF00] flex items-center justify-center border-2 border-black font-black text-sm shrink-0">
                    {userName.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-black uppercase truncate">{userName}</p>
                    <p className="text-[10px] font-mono opacity-60 truncate">{userEmail}</p>
                  </div>
                </div>
                <button onClick={handleLogout} title="Logout" className="p-2 hover:bg-black/10 transition-colors shrink-0">
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}
      </aside>

      {/* Sidebar Toggle */}
      <button
        onClick={() => setIsSidebarOpen(!isSidebarOpen)}
        className={`absolute top-1/2 -translate-y-1/2 z-50 flex items-center justify-center w-6 h-12 bg-black border-2 border-white text-white hover:bg-[#E2FF00] hover:text-black hover:border-black transition-all duration-300 focus:outline-none ${isSidebarOpen ? "left-[calc(85vw-12px)] md:left-[268px]" : "left-[-2px]"}`}
      >
        {isSidebarOpen ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4 ml-1" />}
      </button>

      {/* ─── Chat Area ─────────────────────────────────────────────────────── */}
      <section className="flex-1 w-full bg-[#000000] relative overflow-hidden flex flex-col">
        {/* Navbar */}
        <header className="sticky top-0 z-20 w-full bg-[#E2FF00] border-b-4 border-black p-4 flex justify-between items-center shrink-0">
          <div className="flex items-center gap-2 sm:gap-4 z-10">
            <Button size="icon" className="bg-black text-[#E2FF00] hover:bg-white hover:text-black border-2 border-black rounded-none shadow-[2px_2px_0px_#000000] transition-all shrink-0" title="Settings">
              <Settings className="w-5 h-5" />
            </Button>
          </div>

          <div className="absolute left-1/2 -translate-x-1/2 pointer-events-none flex items-center justify-center z-0">
            <span className="font-black text-xl sm:text-2xl tracking-tighter uppercase italic text-black truncate">SERVIX</span>
          </div>

          <div className="flex items-center gap-2 sm:gap-4 justify-end z-10">
            <Button onClick={startNewChat} className="bg-black text-[#E2FF00] hover:bg-white hover:text-black border-2 border-black rounded-none shadow-[2px_2px_0px_#000000] font-bold uppercase tracking-widest gap-2 transition-all">
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">New Chat</span>
            </Button>
            <Button size="icon" onClick={handleLogout} title="Logout" className="bg-black text-[#E2FF00] hover:bg-white hover:text-black border-2 border-black rounded-none shadow-[2px_2px_0px_#000000] transition-all shrink-0">
              <LogOut className="w-5 h-5" />
            </Button>
          </div>
        </header>

        {/* Messages */}
        <div ref={scrollRef} className={`flex-1 overflow-y-auto p-4 sm:p-6 md:p-8 pb-32 md:pb-40 space-y-6 scroll-smooth custom-scrollbar w-full max-w-4xl mx-auto transition-opacity duration-700 ${isNewChat ? "opacity-0 pointer-events-none" : "opacity-100"}`}>
          {messages.map((message) => (
            <div key={message.id} className={`flex gap-4 ${message.role === "user" ? "flex-row-reverse" : "flex-row"} animate-in fade-in duration-200`}>
              <div className={`flex items-center justify-center flex-shrink-0 w-10 h-10 border-2 border-white ${message.role === "user" ? "bg-[#E2FF00] text-black border-[#E2FF00]" : "bg-black text-white"}`}>
                {message.role === "user" ? <User className="w-5 h-5" /> : <Bot className="w-5 h-5" />}
              </div>
              <div className={`max-w-[85%] px-5 py-3.5 text-[15px] leading-relaxed border-2 ${message.role === "user" ? "bg-[#E2FF00] text-black border-[#E2FF00] shadow-[2px_2px_0px_#ffffff]" : "bg-[#111111] text-white border-white shadow-[2px_2px_0px_#ffffff] markdown-body"}`}>
                {message.role === "user" ? (
                  message.content.split("\n").map((line, i) => (
                    <span key={i} className="block min-h-[1.25rem] font-medium">{line}</span>
                  ))
                ) : (
                  <ReactMarkdown remarkPlugins={[remarkGfm]} components={{
                    code({ node, inline, className, children, ...props }: any) {
                      const match = /language-(\w+)/.exec(className || "");
                      return !inline && match ? (
                        <div className="my-4 border-2 border-[#E2FF00] shadow-[2px_2px_0px_#E2FF00]">
                          <div className="bg-[#E2FF00] px-4 py-1.5 text-xs text-black font-mono font-bold uppercase tracking-wider border-b-2 border-black">{match[1]}</div>
                          <SyntaxHighlighter {...props} style={vscDarkPlus} language={match[1]} PreTag="div" className="!mt-0 !mb-0 !rounded-none !bg-black" customStyle={{ margin: 0, padding: "1rem", background: "#000" }}>
                            {String(children).replace(/\n$/, "")}
                          </SyntaxHighlighter>
                        </div>
                      ) : (
                        <code {...props} className="bg-[#E2FF00] text-black px-1.5 py-0.5 text-sm font-mono font-bold">{children}</code>
                      );
                    },
                    p: ({ children }) => <p className="mb-4 last:mb-0 leading-relaxed font-medium">{children}</p>,
                    ul: ({ children }) => <ul className="list-disc pl-6 mb-4 space-y-2 font-medium marker:text-[#E2FF00]">{children}</ul>,
                    ol: ({ children }) => <ol className="list-decimal pl-6 mb-4 space-y-2 font-medium marker:text-[#E2FF00] font-bold">{children}</ol>,
                    li: ({ children }) => <li className="pl-2">{children}</li>,
                    h1: ({ children }) => <h1 className="text-2xl font-black uppercase italic mb-4 mt-6 text-[#E2FF00] border-b-2 border-[#E2FF00] pb-2">{children}</h1>,
                    h2: ({ children }) => <h2 className="text-xl font-black uppercase italic mb-3 mt-5 text-white">{children}</h2>,
                    h3: ({ children }) => <h3 className="text-lg font-bold uppercase mb-2 mt-4 text-[#E2FF00]">{children}</h3>,
                    a: ({ children, href }) => <a href={href} target="_blank" rel="noopener noreferrer" className="text-[#E2FF00] hover:bg-[#E2FF00] hover:text-black font-bold underline underline-offset-4 transition-colors px-1">{children}</a>,
                    strong: ({ children }) => <strong className="font-black text-[#E2FF00] tracking-wide">{children}</strong>,
                  }}>
                    {message.content}
                  </ReactMarkdown>
                )}
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="flex gap-4 flex-row animate-in fade-in duration-200">
              <div className="flex items-center justify-center flex-shrink-0 w-10 h-10 border-2 border-white bg-black text-white"><Bot className="w-5 h-5" /></div>
              <div className="flex items-center gap-2 px-5 py-4 border-2 border-white bg-[#111111] shadow-[2px_2px_0px_#ffffff]">
                <span className="w-2.5 h-2.5 bg-[#E2FF00] animate-pulse" style={{ animationDelay: "0ms" }}></span>
                <span className="w-2.5 h-2.5 bg-[#E2FF00] animate-pulse" style={{ animationDelay: "150ms" }}></span>
                <span className="w-2.5 h-2.5 bg-[#E2FF00] animate-pulse" style={{ animationDelay: "300ms" }}></span>
              </div>
            </div>
          )}
        </div>

        {/* Input Area */}
        <div className="w-full absolute left-0 transition-all duration-700 ease-[cubic-bezier(0.4,0,0.2,1)] z-10 flex flex-col items-center"
          style={{ bottom: isNewChat ? "50%" : "0%", transform: isNewChat ? "translateY(50%)" : "translateY(0%)" }}>

          {/* Welcome */}
          <div className={`max-w-4xl mx-auto w-full px-4 sm:px-6 md:px-8 transition-all duration-700 text-center flex flex-col items-center justify-center ${isNewChat ? "opacity-100 translate-y-0 mb-8 h-auto" : "opacity-0 translate-y-4 h-0 mb-0 overflow-hidden"}`}>
            <p className="text-[#E2FF00]/60 font-bold uppercase tracking-widest text-sm mb-3">Welcome back</p>
            <h2 className="text-4xl md:text-5xl lg:text-6xl font-black uppercase italic tracking-tighter text-[#E2FF00]">
              {userName ? `Hey, ${userName.split(" ")[0]}.` : "What's on your mind?"}
            </h2>
          </div>

          <footer className={`w-full bg-black p-4 sm:p-6 md:p-8 ${!isNewChat ? "border-t-2 border-white" : "bg-transparent"}`}>
            <div className="max-w-4xl mx-auto w-full">
              <form onSubmit={handleSend} className="flex flex-col w-full bg-black border-2 border-white shadow-[2px_2px_0px_#E2FF00] focus-within:shadow-[4px_4px_0px_#E2FF00] transition-all duration-200">
                <div className="flex w-full items-center p-1">
                  <input type="file" hidden accept=".pdf,.doc,.docx,.txt,.html,.htm" ref={fileInputRef} onChange={(e) => { if (e.target.files?.[0]) setAttachedFile(e.target.files[0]); }} />
                  <Button type="button" size="icon" variant="ghost" className="h-12 w-12 rounded-none text-white hover:text-black hover:bg-[#E2FF00] transition-colors shrink-0" onClick={() => fileInputRef.current?.click()}>
                    <Paperclip className="w-5 h-5" />
                  </Button>
                  <Input
                    type="text"
                    placeholder="ENTER COMMAND..."
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    className="flex-1 rounded-none bg-transparent border-0 focus-visible:ring-0 focus-visible:ring-offset-0 text-white placeholder:text-gray-500 placeholder:font-bold placeholder:tracking-widest font-mono text-base px-2 h-12"
                    disabled={isLoading}
                    autoFocus
                  />
                  <Button type="submit" size="icon" disabled={(!input.trim() && !attachedFile) || isLoading} className="h-12 w-12 rounded-none bg-[#E2FF00] hover:bg-white text-black transition-colors disabled:opacity-50 shrink-0 border-l-2 border-white">
                    <Send className="w-5 h-5" />
                  </Button>
                </div>
                {attachedFile && (
                  <div className="flex items-center justify-between bg-[#111111] border-t-2 border-white p-2">
                    <div className="flex items-center space-x-3 overflow-hidden pl-2">
                      <FileText className="w-4 h-4 text-[#E2FF00] shrink-0" />
                      <span className="text-sm text-white font-mono font-bold truncate">{attachedFile.name}</span>
                    </div>
                    <button type="button" onClick={() => { setAttachedFile(null); if (fileInputRef.current) fileInputRef.current.value = ""; }} className="text-white hover:text-black hover:bg-[#E2FF00] transition-colors shrink-0 p-2">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </form>
            </div>
          </footer>
        </div>

        <style dangerouslySetInnerHTML={{
          __html: `
          .custom-scrollbar::-webkit-scrollbar { width: 12px; }
          .custom-scrollbar::-webkit-scrollbar-track { background: #000; border-left: 2px solid #333; }
          .custom-scrollbar::-webkit-scrollbar-thumb { background-color: #E2FF00; border: 2px solid #000; }
          .custom-scrollbar-dark::-webkit-scrollbar { width: 8px; }
          .custom-scrollbar-dark::-webkit-scrollbar-track { background: #E2FF00; }
          .custom-scrollbar-dark::-webkit-scrollbar-thumb { background: #000; }
        ` }} />
      </section>
    </main>
  );
}
