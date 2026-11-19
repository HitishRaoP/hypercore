# 09 - Use Case Diagram

A UML **use case diagram** of Hypercore, written as text so it can be rendered
or handed to another AI agent.

Mermaid has no native use-case diagram type, so three forms are provided:

| Form | Best for |
|------|----------|
| [Mermaid flowchart](#1-mermaid-use-case-diagram) | Rendering in Mermaid Live, GitHub, or any Mermaid plugin |
| [PlantUML](#2-plantuml-native-use-case-diagram) | True UML semantics (`actor`, `usecase`, `<<include>>`, `<<extend>>`) |
| [Compact](#3-compact-use-case-diagram-image-friendly) | Image-generation agents — fewer ellipses, larger labels |

---

## 1. Mermaid use case diagram

Actors sit outside the boundary; ovals inside are use cases; dashed arrows are
`«include»` and `«extend»` relationships.

```mermaid
flowchart LR
    %% ---------------------------- Actors ----------------------------
    Visitor["👤 Visitor"]
    Developer["👩‍💻 Developer"]
    NodeOwner["🖥️ Node Owner"]
    Caller["🌐 API Caller"]
    Scheduler["⏱️ Scheduler"]

    %% ---------------------- System boundary -------------------------
    subgraph HC["Hypercore System Boundary"]
        direction TB

        subgraph Access["Account and Access"]
            A1([Sign up])
            A2([Sign in with password])
            A3([Sign in with passkey])
            A4([Reset password])
            A5([Sign out])
        end

        subgraph Author["Function Authoring"]
            F1([Write TypeScript function])
            F2([Upload source files])
            F3([Check worker name])
            F4([Choose target node])
            F5([Deploy function])
            F6([Copy public URL])
            F7([Browse function template])
        end

        subgraph Observe["Monitoring"]
            M1([View deployments])
            M2([View invocation logs])
            M3([View registered nodes])
            M4([Read node activity])
        end

        subgraph NodeMgmt["Node Management"]
            N1([Download agent])
            N2([Register node])
            N3([View machine specs])
            N4([View live metrics])
            N5([Unregister node])
            N6([Auto-update agent])
        end

        subgraph Runtime["Function Runtime"]
            R1([Invoke by deployment ID])
            R2([Invoke by worker name])
            R3([Receive function output])
        end

        subgraph Ops["Routing and Execution — system"]
            S1([Open SSE stream])
            S2([Reconnect with backoff])
            S3([Send heartbeat])
            S4([Route deployment])
            S5([Download source files])
            S6([Bundle TypeScript to JS])
            S7([Compile JS to WebAssembly])
            S8([Upload artifact])
            S9([Run WASM in sandbox])
            S10([Report invocation result])
            S11([Record status in Postgres])
            S12([Reroute to fallback node])
            S13([Persist activity history])
        end
    end

    %% --------------------- Actor to use case ------------------------
    Visitor --> A1
    Visitor --> A2
    Visitor --> A3
    Visitor --> A4
    Visitor --> N1

    Developer --> A2
    Developer --> A5
    Developer --> F1
    Developer --> F2
    Developer --> F3
    Developer --> F4
    Developer --> F5
    Developer --> F6
    Developer --> F7
    Developer --> M1
    Developer --> M2
    Developer --> M3
    Developer --> M4

    NodeOwner --> N2
    NodeOwner --> N3
    NodeOwner --> N4
    NodeOwner --> N5
    NodeOwner --> N6

    Caller --> R1
    Caller --> R2
    R1 --> R3
    R2 --> R3

    Scheduler --> S3

    %% ------------------- Include and extend ------------------------
    F5 -.->|«include»| F2
    F5 -.->|«include»| F4
    F5 -.->|«include»| S4

    N2 -.->|«include»| S1
    S2 -.->|«extend»| S1
    S1 -.->|«include»| S3
    S4 -.->|«include»| S1
    S12 -.->|«extend»| S4
    S4 -.->|«include»| S11

    S5 --> S6
    S6 --> S7
    S7 --> S8
    S8 --> S11

    R1 -.->|«include»| S9
    R2 -.->|«include»| S9
    S9 --> S10
    S10 --> S11
    S5 -.->|«extend»| S9

    M4 -.->|«include»| S13

    %% ---------------------------- Styling --------------------------
    classDef actor fill:#fff4d6,stroke:#a97b12,stroke-width:2px,color:#3d2c00
    classDef usecase fill:#e8f0fe,stroke:#3b6fb6,stroke-width:1.5px,color:#102a43
    classDef systemUseCase fill:#e9f7ef,stroke:#2f855a,stroke-width:1.5px,color:#12352a

    class Visitor,Developer,NodeOwner,Caller,Scheduler actor
    class A1,A2,A3,A4,A5,F1,F2,F3,F4,F5,F6,F7,M1,M2,M3,M4,N1,N2,N3,N4,N5,N6,R1,R2,R3 usecase
    class S1,S2,S3,S4,S5,S6,S7,S8,S9,S10,S11,S12,S13 systemUseCase
```

---

## 2. PlantUML native use case diagram

This version is the most faithful UML. Render it with the PlantUML server,
the VS Code extension, or `plantuml -tpng use-case.puml`.

```plantuml
@startuml Hypercore-Use-Cases
left to right direction
skinparam packageStyle rectangle
skinparam usecase {
  BackgroundColor #E8F0FE
  BorderColor #3B6FB6
}
skinparam actor {
  BackgroundColor #FFF4D6
  BorderColor #A97B12
}

actor Visitor
actor Developer
actor "Node Owner" as Owner
actor "API Caller" as Caller
actor Scheduler <<system>>

rectangle "Hypercore" {
  package "Account and Access" {
    usecase "Sign up" as UC_SignUp
    usecase "Sign in with password" as UC_SignIn
    usecase "Sign in with passkey" as UC_Passkey
    usecase "Reset password" as UC_Reset
    usecase "Sign out" as UC_SignOut
  }

  package "Function Authoring" {
    usecase "Write TypeScript function" as UC_Write
    usecase "Upload source files" as UC_Upload
    usecase "Check worker name" as UC_CheckName
    usecase "Choose target node" as UC_ChooseNode
    usecase "Deploy function" as UC_Deploy
    usecase "Copy public URL" as UC_CopyUrl
    usecase "Browse function template" as UC_Template
  }

  package "Monitoring" {
    usecase "View deployments" as UC_ViewDeploys
    usecase "View invocation logs" as UC_ViewLogs
    usecase "View registered nodes" as UC_ViewNodes
    usecase "Read node activity" as UC_Activity
  }

  package "Node Management" {
    usecase "Download agent" as UC_Download
    usecase "Register node" as UC_Register
    usecase "View machine specs" as UC_Specs
    usecase "View live metrics" as UC_Metrics
    usecase "Unregister node" as UC_Unregister
    usecase "Auto-update agent" as UC_Update
  }

  package "Function Runtime" {
    usecase "Invoke by deployment ID" as UC_InvokeId
    usecase "Invoke by worker name" as UC_InvokeName
    usecase "Receive function output" as UC_Output
  }

  package "Routing and Execution (system)" {
    usecase "Open SSE stream" as UC_Stream
    usecase "Reconnect with backoff" as UC_Reconnect
    usecase "Send heartbeat" as UC_Heartbeat
    usecase "Route deployment" as UC_Route
    usecase "Download source files" as UC_DownloadSrc
    usecase "Bundle TypeScript to JS" as UC_Bundle
    usecase "Compile JS to WebAssembly" as UC_Compile
    usecase "Upload artifact" as UC_UploadWasm
    usecase "Run WASM in sandbox" as UC_Run
    usecase "Report invocation result" as UC_Report
    usecase "Record status in Postgres" as UC_Record
    usecase "Reroute to fallback node" as UC_Fallback
    usecase "Persist activity history" as UC_Persist
  }
}

' ---------------- Actor to use case ----------------
Visitor --> UC_SignUp
Visitor --> UC_SignIn
Visitor --> UC_Passkey
Visitor --> UC_Reset
Visitor --> UC_Download

Developer --> UC_SignIn
Developer --> UC_SignOut
Developer --> UC_Write
Developer --> UC_Upload
Developer --> UC_CheckName
Developer --> UC_ChooseNode
Developer --> UC_Deploy
Developer --> UC_CopyUrl
Developer --> UC_Template
Developer --> UC_ViewDeploys
Developer --> UC_ViewLogs
Developer --> UC_ViewNodes
Developer --> UC_Activity

Owner --> UC_Register
Owner --> UC_Specs
Owner --> UC_Metrics
Owner --> UC_Unregister
Owner --> UC_Update

Caller --> UC_InvokeId
Caller --> UC_InvokeName
UC_InvokeId --> UC_Output
UC_InvokeName --> UC_Output

Scheduler --> UC_Heartbeat

' ---------------- Include / extend ----------------
UC_Deploy ..> UC_Upload : <<include>>
UC_Deploy ..> UC_ChooseNode : <<include>>
UC_Deploy ..> UC_Route : <<include>>
UC_Template ..> UC_Upload : <<include>>

UC_Register ..> UC_Stream : <<include>>
UC_Reconnect ..> UC_Stream : <<extend>>
UC_Heartbeat ..> UC_Stream : <<include>>
UC_Route ..> UC_Stream : <<include>>
UC_Fallback ..> UC_Route : <<extend>>
UC_Route ..> UC_Record : <<include>>

UC_DownloadSrc --> UC_Bundle
UC_Bundle --> UC_Compile
UC_Compile --> UC_UploadWasm
UC_UploadWasm --> UC_Record

UC_InvokeId ..> UC_Run : <<include>>
UC_InvokeName ..> UC_Run : <<include>>
UC_Run --> UC_Report
UC_Report --> UC_Record
UC_DownloadSrc ..> UC_Run : <<extend>>

UC_Activity ..> UC_Persist : <<include>>

@enduml
```

---

## 3. Compact use case diagram (image-friendly)

```mermaid
flowchart LR
    Visitor["👤 Visitor"]
    Developer["👩‍💻 Developer"]
    NodeOwner["🖥️ Node Owner"]
    Caller["🌐 API Caller"]

    subgraph HC["Hypercore"]
        direction TB

        subgraph Control["Control Plane"]
            A([Sign up / sign in])
            B([Write and upload function])
            C([Deploy to a node])
            D([View deployments and logs])
            E([View registered nodes])
            F([Download agent])
        end

        subgraph Node["Execution Plane"]
            G([Register node])
            H([Open SSE connection])
            I([Build TypeScript to WASM])
            J([Run WASM in sandbox])
            K([Report result])
            L([Show machine specs and metrics])
            P([Reconnect on drop])
        end

        subgraph Runtime["Public Runtime"]
            M([Invoke by deployment ID])
            N([Invoke by worker name])
            O([Receive output])
        end
    end

    Visitor --> A
    Visitor --> F

    Developer --> A
    Developer --> B
    Developer --> C
    Developer --> D
    Developer --> E

    NodeOwner --> F
    NodeOwner --> G
    NodeOwner --> L

    Caller --> M
    Caller --> N
    M --> O
    N --> O

    C -.->|«include»| G
    C -.->|«include»| H
    C -.->|«include»| I

    G -.->|«include»| H
    P -.->|«extend»| H
    I --> K
    M -.->|«include»| J
    N -.->|«include»| J
    J --> K

    classDef actor fill:#fff4d6,stroke:#a97b12,stroke-width:2px,color:#3d2c00
    classDef usecase fill:#e8f0fe,stroke:#3b6fb6,stroke-width:1.5px,color:#102a43
    class Visitor,Developer,NodeOwner,Caller actor
    class A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P usecase
```

---

## 4. Image-generation prompt

Paste this with the compact diagram (or its rendered image) into the image
agent.

> Create a clean, high-resolution **UML use case diagram poster** for a system
> called **Hypercore**. Landscape orientation, white background, technical
> blueprint style, thin dark-grey lines, generous spacing, and large legible
> labels.
>
> Draw **four actors as classic UML stick figures** down the left and right
> sides, outside the system boundary: `Visitor`, `Developer`, `Node Owner`,
> and `API Caller`.
>
> In the centre, draw a large rounded rectangle labelled **Hypercore** as the
> system boundary. Inside it, arrange use cases as **ellipses** in three
> labelled groups:
> - **Control Plane** (soft blue): Sign up / sign in, Write and upload
>   function, Deploy to a node, View deployments and logs, View registered
>   nodes, Download agent.
> - **Execution Plane** (soft green): Register node, Open SSE connection,
>   Build TypeScript to WASM, Run WASM in sandbox, Report result, Show machine
>   specs and metrics.
> - **Public Runtime** (soft amber): Invoke by deployment ID, Invoke by worker
>   name, Receive output.
>
> Connect actors to their use cases with solid lines. Use dashed arrows
> between use cases, labelled **«include»** and **«extend»**:
> `Deploy to a node → Open SSE connection : «include»`,
> `Invoke by worker name → Run WASM in sandbox : «include»`,
> `Run WASM in sandbox → Report result`,
> `Register node → Open SSE connection : «include»`.
>
> Add a small legend in the bottom-right for actor, use case, «include», and
> «extend». Title at the top: **Hypercore — Use Case Diagram**. Subtitle:
> **Who can do what in the system**.
>
> Keep it uncluttered: fewer ellipses with larger text beats cramming every
> edge. No 3D effects, no photographs, no decorative icons.

### If the text is garbled

Image models routinely misspell dense labels. Either render the Mermaid or
PlantUML source (exact text), or generate the layout and retype labels in a
vector editor.

---

## 5. Use case catalogue

The concrete trigger for each use case. Routes are from `apps/api/src/app.ts`.

| Actor | Use case | Trigger / route |
|-------|----------|-----------------|
| Visitor | Sign up | `POST /api/auth/sign-up/email` |
| Visitor | Sign in with password | `POST /api/auth/sign-in/email` |
| Visitor | Sign in with passkey | `POST /api/auth/passkey/*` |
| Visitor | Reset password | `POST /api/auth/forget-password` |
| Visitor / Node Owner | Download agent | `GET /download` (dashboard) |
| Developer | Upload source files | `POST /code-upload` |
| Developer | Check worker name | `GET /code-upload/check-name` |
| Developer | Browse template | `GET /code-upload/template` |
| Developer | Deploy function | `POST /deployment` |
| Developer | View deployments | `GET /deployment` |
| Developer | View invocation logs | `GET /invocations` |
| Developer | View registered nodes | `GET /api/v1/nodes` |
| Node Owner | Register node | `POST /api/v1/nodes/register` |
| Node Owner | View machine specs | Agent UI (Tauri `get_machine_info`) |
| Node Owner | View live metrics | Agent UI (local `metrics_tick`) |
| Node Owner | Unregister node | Agent UI (Tauri `unregister_node`) |
| API Caller | Invoke by deployment ID | `GET /invoke/:deploymentId` |
| API Caller | Invoke by worker name | `GET /w/:workerName` |
| Agent (system) | Open SSE stream | `GET /agents/events?machineId=…` |
| Agent (system) | Acknowledge build | `POST /deployment/:id/ack` |
| Agent (system) | Upload artifact | `POST /deployment/:id/artifact` |
| Agent (system) | Report invocation result | `POST /invocations/:id/result` |
| Agent (system) | Read activity | `GET /activity?machineId=…` |
| Agent (system) | Fetch source / artifact | `GET /code-upload/file?key=…` |
| Dashboard (system) | List online agents | `GET /agents/online` |
| Scheduler (system) | Heartbeat | SSE comment every 25 s |

### Relationship rules used above

| Relationship | Meaning |
|--------------|---------|
| Solid line, actor → use case | The actor can start that use case |
| `«include»` | The base use case always performs the included one |
| `«extend»` | The extending use case runs only under a condition (disconnect, cache miss, owner offline) |
| `«system»` actor | A timer or background process, not a person |

---

## 6. Rendering

```bash
# Mermaid
npx -y @mermaid-js/mermaid-cli -i use-case.mmd -o use-case.png -w 2400

# PlantUML (needs Java + plantuml.jar)
java -jar plantuml.jar -tpng use-case.puml
```

PlantUML also has a public server at <https://www.plantuml.com/plantuml> if
installing Java is not an option.
