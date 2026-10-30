import { ChatPanel } from "./ChatWidget";

export default function ChatPage() {
  return (
    <div className="container-page py-6">
      <div className="mx-auto flex h-[calc(100vh-12rem)] min-h-[520px] max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <ChatPanel full />
      </div>
    </div>
  );
}
