"use client";
import { gatewayFetch } from "@/lib/gatewayFetch";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useFetch } from "@/lib/hooks";
import { Trash2, Pencil, Check, X, Brain } from "lucide-react";

interface KnowledgeFact {
  _id: string;
  category: string;
  key: string;
  value: string;
  confidence: number;
  source: string;
  updatedAt: number;
}

export function KnowledgeTab() {
  const { data: agents } = useFetch<any[]>("/api/agents");
  const agent = agents?.[0];
  const [facts, setFacts] = useState<KnowledgeFact[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  const fetchFacts = useCallback(async () => {
    if (!agent?._id) return;
    setLoading(true);
    try {
      const res = await gatewayFetch(`/api/knowledge?agentId=${agent._id}`);
      const data = await res.json();
      setFacts(data.knowledge || []);
    } catch {
      toast.error("Failed to load knowledge");
    } finally {
      setLoading(false);
    }
  }, [agent?._id]);

  useEffect(() => {
    fetchFacts();
  }, [fetchFacts]);

  const deleteFact = async (id: string) => {
    try {
      await gatewayFetch("/api/knowledge", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      setFacts((prev) => prev.filter((f) => f._id !== id));
      toast.success("Fact removed");
    } catch {
      toast.error("Failed to delete");
    }
  };

  const saveEdit = async (id: string) => {
    try {
      await gatewayFetch("/api/knowledge", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, value: editValue }),
      });
      setFacts((prev) =>
        prev.map((f) => (f._id === id ? { ...f, value: editValue } : f))
      );
      setEditingId(null);
      toast.success("Fact updated");
    } catch {
      toast.error("Failed to update");
    }
  };

  // Group by category
  const grouped: Record<string, KnowledgeFact[]> = {};
  for (const f of facts) {
    if (!grouped[f.category]) grouped[f.category] = [];
    grouped[f.category].push(f);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-muted-foreground text-sm">
        <Brain className="h-4 w-4" />
        <span>The AI learned these facts from your conversations</span>
      </div>

      {loading && <p className="text-muted-foreground">Loading...</p>}

      {!loading && facts.length === 0 && (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            No knowledge yet. Start chatting and the AI will learn about you!
          </CardContent>
        </Card>
      )}

      {Object.entries(grouped).map(([category, items]) => (
        <Card key={category}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium capitalize">
              {category}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {items.map((fact) => (
              <div
                key={fact._id}
                className="flex items-center gap-2 text-sm group"
              >
                <span className="text-muted-foreground min-w-[120px]">
                  {fact.key.replace(/_/g, " ")}:
                </span>
                {editingId === fact._id ? (
                  <>
                    <Input
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      className="h-7 text-sm flex-1"
                    />
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6"
                      onClick={() => saveEdit(fact._id)}
                    >
                      <Check className="h-3 w-3" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6"
                      onClick={() => setEditingId(null)}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </>
                ) : (
                  <>
                    <span className="flex-1">{fact.value}</span>
                    <span className="text-xs text-muted-foreground opacity-0 group-hover:opacity-100">
                      {Math.round(fact.confidence * 100)}%
                    </span>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6 opacity-0 group-hover:opacity-100"
                      onClick={() => {
                        setEditingId(fact._id);
                        setEditValue(fact.value);
                      }}
                    >
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6 opacity-0 group-hover:opacity-100 text-destructive"
                      onClick={() => deleteFact(fact._id)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
