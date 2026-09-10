"use client";

import { useState } from "react";
import { CreateOptions } from "./components/create-options";
import { HWTemplate } from "./components/hw-template";
import { UploadCode } from "./components/upload-code";

type CreateStep = "template" | "upload" | null;

export const CreateView = () => {
  const [selected, setSelected] = useState<CreateStep>(null);
  const handleBack = () => setSelected(null);

  return (
    <div className="w-full">
      {selected === null && <CreateOptions onSelect={setSelected} />}
      {selected === "template" && <HWTemplate onBack={handleBack} />}
      {selected === "upload" && <UploadCode onBack={handleBack} />}
    </div>
  );
};
