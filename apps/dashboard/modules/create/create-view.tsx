"use client"

import {
  Globe,
  Folder,
} from "lucide-react"

import { Button } from "@hypercore/ui/components/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@hypercore/ui/components/card"

interface CreateViewProps {
  onDeployClick: () => void
  onUploadClick: () => void
}

export function CreateView({
    onDeployClick,
    onUploadClick,
}: CreateViewProps) {
  return (
    <div className="min-h-screen bg-background">
      {/* Main */}
      <main className="relative min-h-[calc(100vh-72px)]">

        <div className="mx-auto grid max-w-[1536px] grid-cols-1 lg:grid-cols-[1fr_2fr_1fr]">
          {/* Left column */}
          <div className="pt-10 text-center lg:pt-[225px]">
          </div>

          {/* Center column */}
          <div className="px-5 pt-10 lg:pt-[214px]">
            <Card className="mx-auto w-full max-w-[670px] rounded-2xl shadow-sm">
              <CardHeader className="px-8 pt-8">
                <CardTitle className="text-xl font-medium">
                  Make something new
                </CardTitle>

                <CardDescription className="mt-1 text-base text-zinc-500">
                  Start from a template, connect a repository, or upload your
                  code.
                </CardDescription>
              </CardHeader>

              <CardContent className="px-8 pb-8">
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">

                  {/* Hello World */}
                  <CreateOption
                    icon={
                      <Globe className="h-5 w-5 text-green-500" />
                    }
                    label="Start with Hello World!"
                    fullWidth
                    onClick={onDeployClick}
                  />


                  {/* Static files */}
                  <CreateOption
                    icon={
                      <Folder className="h-5 w-5 text-yellow-500" />
                    }
                    label="Upload your static files"
                    fullWidth
                    onClick={onUploadClick}
                  />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right column */}
          <div className="hidden lg:block" />
        </div>

      </main>
    </div>
  )
}

type CreateOptionProps = {
  icon: React.ReactNode
  label: string
  fullWidth?: boolean
  onClick?: () => void
}

function CreateOption({
  icon,
  label,
  fullWidth = false,
  onClick,
}: CreateOptionProps) {
  return (
    <Button
      variant="outline"
      onClick={onClick}
      className={[
        "h-[70px]",
        "justify-start",
        "gap-3.5",
        "rounded-xl",
        "px-4",
        "text-left",
        "text-[17px]",
        "font-normal",
        "hover:bg-zinc-50",
        fullWidth ? "sm:col-span-2" : "",
      ].join(" ")}
    >
      <span className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-lg border bg-white">
        {icon}
      </span>

      <span>{label}</span>
    </Button>
  )
}