"use client";

import { useState, useEffect, useCallback } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, FolderKanban, Calendar, MessageSquare, Bot, Archive, Play, ChevronDown, ChevronUp } from "lucide-react";

interface Project {
  _id: string;
  name: string;
  description: string;
  status: string;
  priority: number;
  lastActiveAt?: number;
  conversationCount?: number;
  activeTaskCount?: number;
}

interface Task {
  _id: string;
  projectId: string;
  title: string;
  description: string;
  status: string;
  priority: number;
  assignee?: string;
  dueDate?: number;
  completedAt?: number;
}

interface Conversation {
  _id: string;
  title?: string;
  summary?: string;
  status: string;
  lastMessageAt: number;
  projectId?: string;
}

interface WorkerAgent {
  _id: string;
  label: string;
  status: string;
  task?: string;
  startedAt: number;
  completedAt?: number;
  projectId?: string;
}

const COLUMNS = [
  { key: "todo", label: "Todo", color: "from-zinc-500/20 to-zinc-600/10" },
  { key: "in_progress", label: "In Progress", color: "from-blue-500/20 to-blue-600/10" },
  { key: "blocked", label: "Blocked", color: "from-red-500/20 to-red-600/10" },
  { key: "done", label: "Done", color: "from-green-500/20 to-green-600/10" },
];

const priorityColors: Record<number, string> = {
  1: "bg-white/[0.08] text-zinc-300",
  2: "bg-blue-500/30 text-blue-300",
  3: "bg-yellow-500/30 text-yellow-300",
  4: "bg-orange-500/30 text-orange-300",
  5: "bg-red-500/30 text-red-300",
};

const statusColors: Record<string, string> = {
  active: "bg-green-500/20 text-green-400 border-green-500/30",
  paused: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  completed: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  archived: "bg-white/[0.06] text-zinc-400 border-white/[0.08]",
};

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [agents, setAgents] = useState<WorkerAgent[]>([]);
  const [selectedProject, setSelectedProject] = useState<string>("all");
  const [expandedProject, setExpandedProject] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"cards" | "kanban">("cards");
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [newTaskOpen, setNewTaskOpen] = useState(false);
  const [newProject, setNewProject] = useState({ name: "", description: "", priority: 3 });
  const [newTask, setNewTask] = useState({ title: "", description: "", priority: 3, projectId: "", dueDate: "" });

  const fetchData = useCallback(async () => {
    const [pRes, tRes] = await Promise.all([fetch("/api/projects"), fetch("/api/tasks")]);
    if (pRes.ok) setProjects(await pRes.json());
    if (tRes.ok) setTasks(await tRes.json());
    // Fetch conversations and agents linked to projects
    try {
      const cRes = await fetch("/api/conversations?withProject=true");
      if (cRes.ok) setConversations(await cRes.json());
    } catch {}
    try {
      const aRes = await fetch("/api/agents/workers?recent=true");
      if (aRes.ok) setAgents(await aRes.json());
    } catch {}
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const filteredTasks = selectedProject === "all" ? tasks : tasks.filter((t) => t.projectId === selectedProject);
  const activeProjects = projects.filter((p) => p.status === "active" || p.status === "paused");
  const completedProjects = projects.filter((p) => p.status === "completed" || p.status === "archived");

  const createProjectFn = async () => {
    const res = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newProject),
    });
    if (res.ok) {
      setNewProjectOpen(false);
      setNewProject({ name: "", description: "", priority: 3 });
      fetchData();
    }
  };

  const createTask = async () => {
    const body: any = { ...newTask, priority: Number(newTask.priority) };
    if (body.dueDate) body.dueDate = new Date(body.dueDate).getTime();
    else delete body.dueDate;
    const res = await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      setNewTaskOpen(false);
      setNewTask({ title: "", description: "", priority: 3, projectId: "", dueDate: "" });
      fetchData();
    }
  };

  const updateTaskStatus = async (taskId: string, status: string) => {
    await fetch(`/api/tasks/${taskId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    fetchData();
  };

  const archiveProject = async (projectId: string) => {
    await fetch(`/api/projects/${projectId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "archived" }),
    });
    fetchData();
  };

  const getProjectTasks = (projectId: string) => tasks.filter((t) => t.projectId === projectId);
  const getProjectConversations = (projectId: string) => conversations.filter((c) => c.projectId === projectId);
  const getProjectAgents = (projectId: string) => agents.filter((a) => a.projectId === projectId);

  const getProjectName = (id: string) => projects.find((p) => p._id === id)?.name || "Unknown";

  const getTaskProgress = (projectId: string) => {
    const pTasks = getProjectTasks(projectId);
    if (pTasks.length === 0) return { done: 0, total: 0, percent: 0 };
    const done = pTasks.filter((t) => t.status === "done").length;
    return { done, total: pTasks.length, percent: Math.round((done / pTasks.length) * 100) };
  };

  const renderProjectCard = (project: Project) => {
    const progress = getTaskProgress(project._id);
    const pConversations = getProjectConversations(project._id);
    const pAgents = getProjectAgents(project._id);
    const isExpanded = expandedProject === project._id;

    return (
      <div key={project._id} className="bg-white/5 backdrop-blur-md border border-white/10 rounded-xl overflow-hidden hover:border-white/20 transition-all">
        {/* Card Header */}
        <div className="p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-sm">{project.name}</h3>
              <Badge className={`${statusColors[project.status]} text-xs border`}>{project.status}</Badge>
              <Badge className={`${priorityColors[project.priority]} text-xs border-0`}>P{project.priority}</Badge>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 hover:bg-white/10"
              onClick={() => setExpandedProject(isExpanded ? null : project._id)}
            >
              {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
          </div>
          <p className="text-xs text-white/40 mb-3 line-clamp-2">{project.description}</p>

          {/* Progress Bar */}
          <div className="mb-3">
            <div className="flex justify-between text-xs text-white/50 mb-1">
              <span>{progress.done}/{progress.total} tasks</span>
              <span>{progress.percent}%</span>
            </div>
            <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-blue-500 to-purple-500 rounded-full transition-all"
                style={{ width: `${progress.percent}%` }}
              />
            </div>
          </div>

          {/* Quick Stats */}
          <div className="flex items-center gap-3 text-xs text-white/40">
            {pConversations.length > 0 && (
              <span className="flex items-center gap-1">
                <MessageSquare className="h-3 w-3" /> {pConversations.length}
              </span>
            )}
            {pAgents.length > 0 && (
              <span className="flex items-center gap-1">
                <Bot className="h-3 w-3" /> {pAgents.length}
              </span>
            )}
            {project.lastActiveAt && (
              <span className="ml-auto">
                Active {new Date(project.lastActiveAt).toLocaleDateString()}
              </span>
            )}
          </div>

          {/* Quick Actions */}
          <div className="flex gap-1.5 mt-3">
            <Button
              size="sm"
              className="h-7 text-xs px-3 bg-gradient-to-r from-blue-500/20 to-purple-500/20 hover:from-blue-500/30 hover:to-purple-500/30 border border-blue-500/30"
              onClick={() => {
                window.location.href = `/chat?project=${encodeURIComponent(project.name)}`;
              }}
            >
              <Play className="h-3 w-3 mr-1" /> Continue
            </Button>
            {project.status === "active" && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs px-2 hover:bg-white/10"
                onClick={() => archiveProject(project._id)}
              >
                <Archive className="h-3 w-3 mr-1" /> Archive
              </Button>
            )}
          </div>
        </div>

        {/* Expanded Details */}
        {isExpanded && (
          <div className="border-t border-white/10 p-4 space-y-3">
            {/* Tasks */}
            {getProjectTasks(project._id).length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-white/60 mb-2">Tasks</h4>
                <div className="space-y-1">
                  {getProjectTasks(project._id).map((task) => (
                    <div key={task._id} className="flex items-center justify-between text-xs">
                      <span className={task.status === "done" ? "line-through text-white/30" : "text-white/70"}>
                        {task.title}
                      </span>
                      <Badge className={`${priorityColors[task.priority]} text-[10px] border-0`}>
                        {task.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Conversations */}
            {pConversations.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-white/60 mb-2">Conversations</h4>
                <div className="space-y-1">
                  {pConversations.slice(0, 5).map((c) => (
                    <div key={c._id} className="text-xs text-white/50">
                      <span className="text-white/70">{c.title || "Untitled"}</span>
                      {c.summary && <span className="ml-2 text-white/30">- {c.summary.slice(0, 60)}...</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Agent Runs */}
            {pAgents.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-white/60 mb-2">Agent Runs</h4>
                <div className="space-y-1">
                  {pAgents.slice(0, 5).map((a) => (
                    <div key={a._id} className="flex items-center justify-between text-xs">
                      <span className="text-white/70">{a.label}</span>
                      <Badge className={`text-[10px] border-0 ${a.status === "completed" ? "bg-green-500/20 text-green-400" : a.status === "running" ? "bg-blue-500/20 text-blue-400" : "bg-red-500/20 text-red-400"}`}>
                        {a.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <AppShell title="Projects">
      <div className="flex flex-col h-full p-4 lg:p-6 gap-6 overflow-auto">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-gradient-to-br from-blue-500/20 to-purple-500/20 backdrop-blur-sm border border-white/10">
              <FolderKanban className="h-5 w-5 text-blue-400" />
            </div>
            <h1 className="text-xl font-bold">Projects</h1>
            <Badge variant="secondary" className="bg-white/10 border-0">{activeProjects.length} active</Badge>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {/* View Toggle */}
            <div className="flex bg-white/5 rounded-lg border border-white/10 p-0.5">
              <Button
                variant="ghost"
                size="sm"
                className={`h-7 text-xs px-3 ${viewMode === "cards" ? "bg-white/10" : ""}`}
                onClick={() => setViewMode("cards")}
              >
                Cards
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className={`h-7 text-xs px-3 ${viewMode === "kanban" ? "bg-white/10" : ""}`}
                onClick={() => setViewMode("kanban")}
              >
                Kanban
              </Button>
            </div>

            {viewMode === "kanban" && (
              <Select value={selectedProject} onValueChange={setSelectedProject}>
                <SelectTrigger className="w-48 bg-white/5 border-white/10 backdrop-blur-md">
                  <SelectValue placeholder="Filter by project" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Projects</SelectItem>
                  {projects.map((p) => (
                    <SelectItem key={p._id} value={p._id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            <Dialog open={newProjectOpen} onOpenChange={setNewProjectOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="bg-white/5 border-white/10 hover:bg-white/10">
                  <Plus className="h-4 w-4 mr-1" />Project
                </Button>
              </DialogTrigger>
              <DialogContent className="bg-white/5 backdrop-blur-2xl border-white/10">
                <DialogHeader><DialogTitle>New Project</DialogTitle></DialogHeader>
                <div className="flex flex-col gap-3">
                  <Input placeholder="Project name" value={newProject.name} onChange={(e) => setNewProject({ ...newProject, name: e.target.value })} className="bg-white/5 border-white/10" />
                  <Textarea placeholder="Description" value={newProject.description} onChange={(e) => setNewProject({ ...newProject, description: e.target.value })} className="bg-white/5 border-white/10" />
                  <Select value={String(newProject.priority)} onValueChange={(v) => setNewProject({ ...newProject, priority: Number(v) })}>
                    <SelectTrigger className="bg-white/5 border-white/10"><SelectValue placeholder="Priority" /></SelectTrigger>
                    <SelectContent>
                      {[1, 2, 3, 4, 5].map((p) => (
                        <SelectItem key={p} value={String(p)}>P{p}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button onClick={createProjectFn} disabled={!newProject.name} className="bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600">Create Project</Button>
                </div>
              </DialogContent>
            </Dialog>

            <Dialog open={newTaskOpen} onOpenChange={setNewTaskOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600">
                  <Plus className="h-4 w-4 mr-1" />Task
                </Button>
              </DialogTrigger>
              <DialogContent className="bg-white/5 backdrop-blur-2xl border-white/10">
                <DialogHeader><DialogTitle>New Task</DialogTitle></DialogHeader>
                <div className="flex flex-col gap-3">
                  <Select value={newTask.projectId} onValueChange={(v) => setNewTask({ ...newTask, projectId: v })}>
                    <SelectTrigger className="bg-white/5 border-white/10"><SelectValue placeholder="Select project" /></SelectTrigger>
                    <SelectContent>
                      {projects.map((p) => (
                        <SelectItem key={p._id} value={p._id}>{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input placeholder="Task title" value={newTask.title} onChange={(e) => setNewTask({ ...newTask, title: e.target.value })} className="bg-white/5 border-white/10" />
                  <Textarea placeholder="Description" value={newTask.description} onChange={(e) => setNewTask({ ...newTask, description: e.target.value })} className="bg-white/5 border-white/10" />
                  <Select value={String(newTask.priority)} onValueChange={(v) => setNewTask({ ...newTask, priority: Number(v) as any })}>
                    <SelectTrigger className="bg-white/5 border-white/10"><SelectValue placeholder="Priority" /></SelectTrigger>
                    <SelectContent>
                      {[1, 2, 3, 4, 5].map((p) => (
                        <SelectItem key={p} value={String(p)}>P{p}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input type="date" value={newTask.dueDate} onChange={(e) => setNewTask({ ...newTask, dueDate: e.target.value })} className="bg-white/5 border-white/10" />
                  <Button onClick={createTask} disabled={!newTask.title || !newTask.projectId} className="bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600">Create Task</Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Cards View */}
        {viewMode === "cards" && (
          <div className="space-y-6">
            {/* Active Projects */}
            {activeProjects.length > 0 && (
              <div>
                <h2 className="text-sm font-semibold text-white/60 mb-3">Active Projects</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {activeProjects.map(renderProjectCard)}
                </div>
              </div>
            )}

            {/* Completed Projects */}
            {completedProjects.length > 0 && (
              <div>
                <h2 className="text-sm font-semibold text-white/40 mb-3">Completed / Archived</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 opacity-60">
                  {completedProjects.map(renderProjectCard)}
                </div>
              </div>
            )}

            {projects.length === 0 && (
              <div className="flex flex-col items-center justify-center min-h-[300px] text-white/30">
                <FolderKanban className="h-12 w-12 mb-4" />
                <p className="text-lg font-medium mb-1">No projects yet</p>
                <p className="text-sm">Create one manually or ask your AI to propose a project.</p>
              </div>
            )}
          </div>
        )}

        {/* Kanban View */}
        {viewMode === "kanban" && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 flex-1 min-h-0">
            {COLUMNS.map((col) => {
              const colTasks = filteredTasks.filter((t) => t.status === col.key);
              return (
                <div key={col.key} className="flex flex-col gap-2">
                  <div className={`rounded-xl px-3 py-2 bg-gradient-to-r ${col.color} backdrop-blur-md border border-white/10`}>
                    <span className="text-sm font-semibold">{col.label}</span>
                    <Badge variant="secondary" className="ml-2 text-xs bg-white/10 border-0">{colTasks.length}</Badge>
                  </div>
                  <div className="flex flex-col gap-2 overflow-y-auto flex-1">
                    {colTasks.map((task) => (
                      <div
                        key={task._id}
                        className="bg-white/5 backdrop-blur-md border border-white/10 rounded-xl p-3 cursor-pointer hover:bg-white/8 hover:border-white/20 transition-all"
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-medium truncate">{task.title}</span>
                          <Badge className={`${priorityColors[task.priority] || "bg-white/[0.08]"} text-xs ml-2 shrink-0 border-0`}>
                            P{task.priority}
                          </Badge>
                        </div>
                        <p className="text-xs text-white/40 mb-2 truncate">{getProjectName(task.projectId)}</p>
                        {task.dueDate && (
                          <div className="flex items-center gap-1 text-xs text-white/40 mb-2">
                            <Calendar className="h-3 w-3" />
                            {new Date(task.dueDate).toLocaleDateString()}
                          </div>
                        )}
                        {col.key !== "done" && (
                          <div className="flex gap-1 flex-wrap">
                            {COLUMNS.filter((c) => c.key !== col.key).map((c) => (
                              <Button
                                key={c.key}
                                variant="ghost"
                                size="sm"
                                className="h-6 text-xs px-2 hover:bg-white/10"
                                onClick={() => updateTaskStatus(task._id, c.key)}
                              >
                                {c.label}
                              </Button>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                    {colTasks.length === 0 && (
                      <div className="flex-1 flex items-center justify-center min-h-[100px] rounded-xl border border-dashed border-white/10 text-white/20 text-xs">
                        No tasks
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}
