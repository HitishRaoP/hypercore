"use client";

import { useRef } from "react";
import { useForm } from "@tanstack/react-form";
import axios from "axios";
import { FolderOpen } from "lucide-react";

import { Button } from "@hypercore/ui/components/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "@hypercore/ui/components/card";
import { Input } from "@hypercore/ui/components/input";
import {
  Field,
  FieldDescription,
  FieldLabel,
} from "@hypercore/ui/components/field";

interface UploadCodeProps {
  onBack: () => void;
}

export function UploadCode({ onBack }: UploadCodeProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const form = useForm({
    defaultValues: {
      file: null as File | null,
    },

    onSubmit: async ({ value }) => {
      if (!value.file) return;
      const formData = new FormData();
      formData.append("file", value.file);
      await axios.post("http://localhost:8080/code-upload", formData);
      form.reset();
    },
  });

  return (
    <Card className="w-1/2 overflow-hidden pb-0 sm:w-2/3 md:w-full">
      <CardHeader>
        <h1 className="text-xl">Upload and deploy</h1>
        <p className="text-sm text-muted-foreground">
          Drag and drop your static files and configure deployment settings.
        </p>
      </CardHeader>

      <CardContent>
        <form
          id="upload-code-form"
          onSubmit={(e) => {
            e.preventDefault();
            form.handleSubmit();
          }}
        >
          <form.Field name="file">
            {(field) => (
              <Field>
                <FieldLabel htmlFor={field.name}>Files</FieldLabel>
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

                  <FieldDescription className="mt-2 text-sm text-zinc-500">
                    Contents you drag here will be uploaded to your account
                  </FieldDescription>

                  {field.state.value && (
                    <p className="mt-3 text-sm font-medium text-zinc-900">
                      Selected: {field.state.value.name}
                    </p>
                  )}

                  <Input
                    ref={inputRef}
                    id={field.name}
                    type="file"
                    className="hidden"
                    onChange={(e) =>
                      field.handleChange(e.target.files?.[0] ?? null)
                    }
                  />
                </div>
              </Field>
            )}
          </form.Field>
        </form>
      </CardContent>

      <CardFooter className="m-0 flex items-center justify-between border-t bg-muted/40 px-5 py-3">
        <Button type="button" variant="outline" onClick={onBack}>
          Back
        </Button>

        <Button type="submit" form="upload-code-form">
          Deploy
        </Button>
      </CardFooter>
    </Card>
  );
}
