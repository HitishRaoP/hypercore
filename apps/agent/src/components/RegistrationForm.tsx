import { Button } from "@hypercore/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@hypercore/ui/components/card";
import { Field, FieldLabel } from "@hypercore/ui/components/field";
import { Input } from "@hypercore/ui/components/input";
import { Loader2, Send } from "lucide-react";
import { useState, type FormEvent } from "react";

export function RegistrationForm({
  onRegister,
}: {
  onRegister: (url: string) => Promise<void>;
}) {
  const [url, setUrl] = useState("https://hypercore.cursent.com");
  const [loading, setLoading] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    try {
      await onRegister(url);
    } finally {
      setLoading(false);
    }
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle>Register this node</CardTitle>
        <CardDescription>
          Join a coordinator to begin scheduling workloads. No API keys or
          broker credentials needed — the agent opens an outbound event
          stream to the coordinator.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-4">
          <Field>
            <FieldLabel htmlFor="coordinator-url">Coordinator URL</FieldLabel>
            <Input
              id="coordinator-url"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              required
            />
          </Field>
          <Button disabled={loading} className="w-full" type="submit">
            {loading ? (
              <Loader2 className="animate-spin" />
            ) : (
              <Send />
            )}
            {loading ? "Negotiating handshake…" : "Register Node"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
