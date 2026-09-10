"use client";

import { useRef, useState } from "react";
import { FolderOpen } from "lucide-react";
import { Button } from "@hypercore/ui/components/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "@hypercore/ui/components/card";
import { Input } from "@hypercore/ui/components/input";

interface UploadCodeProps {
  onBack: () => void;
}

export function UploadCode({ onBack }: UploadCodeProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string>("");

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setFileName(file.name);
    }
  };

  return (
    <Card className="w-1/2 sm:w-2/3 md:w-full overflow-hidden pb-0">
      <CardHeader>
        <h1 className="text-xl">Upload and deploy</h1>
        <p className="text-sm text-muted-foreground">
          Drag and drop your static files and configure deployment settings.
        </p>
      </CardHeader>
      <CardContent>
        <div
          onClick={() => inputRef.current?.click()}
          className="flex h-[212px] cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-zinc-300 bg-white transition-colors hover:bg-zinc-50"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-zinc-300">
            <FolderOpen className="h-5 w-5 text-zinc-500" />
          </div>

          <p className="text-[16px] text-zinc-700">
            Drag in or click to{" "}
            <span className="underline underline-offset-2">
              upload a file or folder
            </span>
            .
          </p>

          <p className="mt-2 text-sm text-zinc-500">
            Contents you drag here will be uploaded to your account
          </p>

          {fileName && (
            <p className="mt-3 text-sm font-medium text-zinc-900">
              Selected: {fileName}
            </p>
          )}

          <Input
            ref={inputRef}
            type="file"
            className="hidden"
            onChange={handleFileChange}
          />
        </div>
      </CardContent>

      <CardFooter className="m-0 flex items-center justify-between border-t bg-muted/40 px-5 py-3">
        <Button variant="outline" onClick={onBack}>
          Back
        </Button>
        <Button>Deploy</Button>
      </CardFooter>
    </Card>
  );
}
