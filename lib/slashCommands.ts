export interface SlashCommandResult {
  handled: boolean;
  command?: string;
  response?: string;
  action?: string;
  args?: Record<string, string>;
}

interface CommandDef {
  name: string;
  description: string;
  usage: string;
  handler: (args: string) => SlashCommandResult;
}

const commands: CommandDef[] = [
  {
    name: "clear",
    description: "Clear current conversation",
    usage: "/clear",
    handler: () => ({
      handled: true,
      command: "clear",
      action: "clear",
      response: "Conversation cleared.",
    }),
  },
  {
    name: "new",
    description: "Start a new conversation",
    usage: "/new",
    handler: () => ({
      handled: true,
      command: "new",
      action: "new_session",
      response: "Starting new conversation...",
    }),
  },
  {
    name: "model",
    description: "Switch model for this session",
    usage: "/model <name>",
    handler: (args) => {
      const model = args.trim();
      if (!model) {
        return { handled: true, command: "model", response: "Usage: /model <name>\nExample: /model claude-sonnet-4-20250514" };
      }
      return {
        handled: true,
        command: "model",
        action: "set_model",
        args: { model },
        response: `Model switched to **${model}** for this session.`,
      };
    },
  },
  {
    name: "thinking",
    description: "Set thinking/reasoning level",
    usage: "/thinking <off|low|medium|high>",
    handler: (args) => {
      const level = args.trim().toLowerCase();
      const valid = ["off", "low", "medium", "high"];
      if (!valid.includes(level)) {
        return { handled: true, command: "thinking", response: `Usage: /thinking <off|low|medium|high>\nCurrent valid levels: ${valid.join(", ")}` };
      }
      return {
        handled: true,
        command: "thinking",
        action: "set_thinking",
        args: { level },
        response: `Thinking level set to **${level}**.`,
      };
    },
  },
  {
    name: "system",
    description: "Set system prompt for this session",
    usage: "/system <text>",
    handler: (args) => {
      const text = args.trim();
      if (!text) {
        return { handled: true, command: "system", response: "Usage: /system <prompt text>" };
      }
      return {
        handled: true,
        command: "system",
        action: "set_system",
        args: { text },
        response: `System prompt updated for this session.`,
      };
    },
  },
  {
    name: "help",
    description: "List available commands",
    usage: "/help",
    handler: () => {
      const lines = commands.map((c) => `**${c.usage}** - ${c.description}`);
      return {
        handled: true,
        command: "help",
        response: `**Available Commands:**\n${lines.join("\n")}`,
      };
    },
  },
];

export function parseSlashCommand(input: string): SlashCommandResult {
  const trimmed = input.trim();
  if (!trimmed.startsWith("/")) return { handled: false };

  const spaceIdx = trimmed.indexOf(" ");
  const cmdName = (spaceIdx === -1 ? trimmed.slice(1) : trimmed.slice(1, spaceIdx)).toLowerCase();
  const args = spaceIdx === -1 ? "" : trimmed.slice(spaceIdx + 1);

  const cmd = commands.find((c) => c.name === cmdName);
  if (!cmd) return { handled: false };

  return cmd.handler(args);
}

export function getCommandSuggestions(partial: string): Array<{ name: string; description: string; usage: string }> {
  if (!partial.startsWith("/")) return [];
  const search = partial.slice(1).toLowerCase();
  return commands
    .filter((c) => c.name.startsWith(search))
    .map(({ name, description, usage }) => ({ name, description, usage }));
}
