"use client";

import { Button } from "@hypercore/ui/components/button";
import { Card, CardContent, CardHeader } from "@hypercore/ui/components/card";
import { Globe, FolderOpen } from "lucide-react";
import { type ReactNode } from "react";

interface OptionRowProps {
  icon: ReactNode;
  label: string;
  onClick: () => void;
}

const OptionRow = ({ icon, label, onClick }: OptionRowProps) => {
  return (
    <Button
      size="lg"
      variant="outline"
      className="w-full flex justify-start items-center gap-3 p-8 rounded-lg pl-3"
      onClick={onClick}
    >
      <span className="flex h-10 w-10 items-center justify-center rounded-md border">
        {icon}
      </span>
      <span className="font-normal">{label}</span>
    </Button>
  );
};

interface CreateOptionsProps {
  onSelect: (option: "template" | "upload") => void;
}

export const CreateOptions = ({ onSelect }: CreateOptionsProps) => {
  return (
    <Card className="w-full">
      <CardHeader>
        <h1 className="text-xl">Make something new</h1>
        <p className="text-sm text-muted-foreground">
          Start from a Hello World template or upload your code.
        </p>
      </CardHeader>
      <CardContent className="space-y-2">
        <OptionRow
          icon={<Globe className="h-4 w-4 text-green-600" />}
          label="Start with Hello World!"
          onClick={() => onSelect("template")}
        />
        <OptionRow
          icon={<FolderOpen className="h-4 w-4 text-yellow-600" />}
          label="Upload your static files"
          onClick={() => onSelect("upload")}
        />
      </CardContent>
    </Card>
  );
};
