"use client"

import { useRef } from "react"
import { CreateView } from "@/modules/create/create-view"
import { DeployView } from "@/modules/create/deploy"
import { UploadView } from "@/modules/create/upload-view"


export default function Home() {
    const deployRef = useRef<HTMLDivElement>(null)
    const uploadRef = useRef<HTMLDivElement>(null)

    const scrollToDeploy = () => {
        deployRef.current?.scrollIntoView({
        behavior: "smooth",
    })
  }

    const scrollToUpload = () => {
        uploadRef.current?.scrollIntoView({
        behavior: "smooth",
    })
  }

  return <div>
    <div><CreateView onDeployClick={scrollToDeploy} onUploadClick={scrollToUpload}/></div>

  <div ref={deployRef}><DeployView/></div>
  <div ref={uploadRef}><UploadView/>
  </div></div>
}
