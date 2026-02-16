/**
 * i18n preparation - centralized string registry
 * All user-facing strings organized by component/page.
 * Call t("key") to get the English string. When i18n is needed,
 * swap the implementation to look up translations.
 */

const strings: Record<string, string> = {
  // App-wide
  "app.name": "Synapse",
  "app.tagline": "AI Gateway Management Hub",
  "app.version": "Synapse v0.1.0",

  // Navigation
  "nav.dashboard": "Dashboard",
  "nav.chat": "Chat",
  "nav.knowledge": "Knowledge",
  "nav.files": "Files",
  "nav.projects": "Projects",
  "nav.analytics": "Analytics",
  "nav.apiDocs": "API Docs",
  "nav.settings": "Settings",

  // Dashboard
  "dashboard.title": "Dashboard",
  "dashboard.greeting.morning": "Good morning",
  "dashboard.greeting.afternoon": "Good afternoon",
  "dashboard.greeting.evening": "Good evening",

  // Chat
  "chat.title": "Chat",
  "chat.placeholder": "Type a message... (/ for commands, Shift+Enter for new line)",
  "chat.send": "Send message",
  "chat.stop": "Stop streaming",
  "chat.emptyState": "Send a message to start the conversation",
  "chat.noChannels": "No channels available",
  "chat.loadingChannel": "Loading channel...",
  "chat.readOnly": "Read-only - highlight text and select \"Ask in...\" to discuss in another channel",
  "chat.newMessages": "New messages",
  "chat.scheduleMessage": "Schedule Message",
  "chat.schedule": "Schedule",
  "chat.attachFile": "Attach file",
  "chat.holdToRecord": "Hold to record voice",
  "chat.fileTooLarge": "File too large (max 25MB)",
  "chat.agentSwitched": "Agent switched",
  "chat.failedSwitchAgent": "Failed to switch agent",
  "chat.failedSend": "Failed to send message",
  "chat.branchSuccess": "Branched! Redirecting...",
  "chat.branchFailed": "Failed to branch",
  "chat.pinned": "Pinned!",
  "chat.unpinned": "Unpinned",
  "chat.failedPin": "Failed to update pin",
  "chat.retry": "Retry",
  "chat.copyCode": "Copy",
  "chat.copied": "Copied",

  // Chat - Create Channel
  "chat.createChannel": "Create Channel",
  "chat.create": "Create",

  // Sidebar
  "sidebar.installApp": "Install App",
  "sidebar.platforms": "Platforms",
  "sidebar.custom": "Custom",
  "sidebar.noCustomChannels": "No custom channels",
  "sidebar.agents.active": "Active",
  "sidebar.agents.history": "History",
  "sidebar.conversations": "Conversations",

  // Conversation Modal
  "convo.untitled": "Untitled Conversation",
  "convo.loading": "Loading...",
  "convo.loadingConversation": "Loading conversation...",
  "convo.goTo": "Go to conversation",
  "convo.continue": "Continue this conversation",
  "convo.summary": "Summary",
  "convo.topics": "Topics",
  "convo.decisions": "Decisions",
  "convo.messages": "Messages",
  "convo.notSummarized": "This conversation hasn't been summarized yet.",
  "convo.summaryHint": "Summaries are generated when conversations close.",

  // Settings
  "settings.title": "Settings",
  "settings.general": "General",
  "settings.agentSoul": "Agent Soul",
  "settings.aiProvider": "AI Provider",
  "settings.models": "Models",
  "settings.channels": "Channels",
  "settings.messages": "Messages",
  "settings.usageBudget": "Usage & Budget",
  "settings.tools": "Tools",
  "settings.skills": "Skills",
  "settings.sessions": "Sessions",
  "settings.voice": "Voice / TTS",
  "settings.scheduler": "Scheduler",
  "settings.automation": "Automation",
  "settings.gateway": "Gateway",
  "settings.gateways": "Gateways",
  "settings.members": "Members",
  "settings.sandbox": "Sandbox",
  "settings.logging": "Logging",
  "settings.envVars": "Env Vars",
  "settings.plugins": "Plugins",
  "settings.browser": "Browser",
  "settings.pm2": "PM2",
  "settings.notifications": "Notifications",
  "settings.license": "License",
  "settings.security": "Security",
  "settings.account": "Account",
  "settings.webhooks": "Webhooks",
  "settings.changelog": "Changelog",
  "settings.about": "About",

  // Keyboard shortcuts
  "shortcuts.title": "Keyboard Shortcuts",

  // Common actions
  "common.close": "Close",
  "common.cancel": "Cancel",
  "common.save": "Save",
  "common.delete": "Delete",
  "common.edit": "Edit",
  "common.confirm": "Confirm",
  "common.loading": "Loading...",
  "common.error": "Error",
  "common.success": "Success",

  // Accessibility
  "a11y.openMenu": "Open menu",
  "a11y.closeMenu": "Close menu",
  "a11y.closeSidebar": "Close sidebar",
  "a11y.openSidebar": "Open sidebar",
  "a11y.scrollToBottom": "Scroll to bottom",
  "a11y.toggleHistory": "Toggle history",
  "a11y.pinMessage": "Pin message",
  "a11y.unpinMessage": "Unpin message",
  "a11y.branchFromHere": "Branch from here",
  "a11y.readAloud": "Read aloud",
  "a11y.stopReading": "Stop reading",
  "a11y.removeAttachment": "Remove attachment",
  "a11y.closeDialog": "Close dialog",
};

/**
 * Get a translated string by key.
 * Currently returns the English string directly.
 * Replace this implementation with a proper i18n library when needed.
 */
export function t(key: string, replacements?: Record<string, string>): string {
  let str = strings[key];
  if (!str) {
    console.warn(`[i18n] Missing string: ${key}`);
    return key;
  }
  if (replacements) {
    for (const [k, v] of Object.entries(replacements)) {
      str = str.replace(`{${k}}`, v);
    }
  }
  return str;
}

export default strings;
