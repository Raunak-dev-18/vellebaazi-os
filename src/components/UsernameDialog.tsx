import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

interface UsernameDialogProps {
  open: boolean;
  onSubmit: (username: string) => void;
  loading?: boolean;
}

export function UsernameDialog({ open, onSubmit, loading }: UsernameDialogProps) {
  const [username, setUsername] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (username.trim().length >= 3) {
      onSubmit(username.trim());
    }
  };

  return (
    <Dialog open={open}>
      <DialogContent className="sm:max-w-md" onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Choose Your Username</DialogTitle>
          <DialogDescription>
            Please enter a username to complete your registration.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="username">Username</Label>
            <Input
              id="username"
              placeholder="Enter username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              minLength={3}
              maxLength={20}
              pattern="[a-zA-Z0-9_]+"
              title="Username can only contain letters, numbers, and underscores"
            />
            <p className="text-xs text-muted-foreground">
              Minimum 3 characters. Only letters, numbers, and underscores allowed.
            </p>
          </div>
          <Button 
            type="submit" 
            className="w-full"
            disabled={loading || username.trim().length < 3}
          >
            {loading ? "Saving..." : "Continue"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
