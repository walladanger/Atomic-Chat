import { createRootRoute, Outlet } from '@tanstack/react-router'
// import { TanStackRouterDevtools } from '@tanstack/react-router-devtools'

import DialogAppUpdater from '@/containers/dialogs/AppUpdater'
import BackendUpdater from '@/containers/dialogs/BackendUpdater'
import SuboptimalBackendDialog from '@/containers/dialogs/SuboptimalBackendDialog'
import { Fragment } from 'react/jsx-runtime'
import type { ReactNode } from 'react'
import { ThemeProvider } from '@/providers/ThemeProvider'
import { InterfaceProvider } from '@/providers/InterfaceProvider'
import { KeyboardShortcutsProvider } from '@/providers/KeyboardShortcuts'
import { DataProvider } from '@/providers/DataProvider'
import { route } from '@/constants/routes'
import { ExtensionProvider } from '@/providers/ExtensionProvider'
import { ToasterProvider } from '@/providers/ToasterProvider'
// import { useAnalytic } from '@/hooks/useAnalytic'
// import { PromptAnalytic } from '@/containers/analytics/PromptAnalytic'
import { useOnboardingModelReminder } from '@/hooks/useOnboardingModelReminder'
import { PromptOnboardingModel } from '@/containers/PromptOnboardingModel'
import { AnalyticProvider } from '@/providers/AnalyticProvider'
import { useLeftPanel } from '@/hooks/useLeftPanel'
import { useTrayStatusSync } from '@/hooks/useTrayStatusSync'
import ToolApproval from '@/containers/dialogs/ToolApproval'
import AgentApprovalDialog from '@/containers/dialogs/AgentApprovalDialog'
import AgentFolderAccessDialog from '@/containers/dialogs/AgentFolderAccessDialog'
import { TranslationProvider } from '@/i18n/TranslationContext'
import OutOfContextPromiseModal from '@/containers/dialogs/OutOfContextDialog'
import AttachmentIngestionDialog from '@/containers/dialogs/AttachmentIngestionDialog'
import WhatsNewDialog from '@/containers/dialogs/WhatsNewDialog'
import { useEffect } from 'react'
import { useSetupCompleted } from '@/hooks/useSetupCompleted'
import GlobalError from '@/containers/GlobalError'
import * as Sentry from '@sentry/react'
import { GlobalEventHandler } from '@/providers/GlobalEventHandler'
import { StartupBackendCoordinator } from '@/providers/StartupBackendCoordinator'
import { ServiceHubProvider } from '@/providers/ServiceHubProvider'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { LeftSidebar } from '@/components/left-sidebar'
import { WindowControls } from '@/components/WindowControls'
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow'

export const Route = createRootRoute({
  component: RootLayout,
  errorComponent: ({ error }) => {
    // ATO-113: router-level errors also reach Sentry (the ErrorBoundary in
    // main.tsx wraps RouterProvider, but TanStack renders this component
    // itself, so capture explicitly here too).
    Sentry.captureException(error)
    return <GlobalError error={error} />
  },
})

function isWindowsMainWindow(): boolean {
  return Boolean(
    IS_TAURI &&
      IS_WINDOWS &&
      getCurrentWebviewWindow().label === 'main'
  )
}

function WindowFrame({ children }: { children: ReactNode }) {
  const customChrome = isWindowsMainWindow()

  return (
    <div className="relative size-full overflow-hidden bg-neutral-50 dark:bg-background">
      {customChrome && (
        <div className="absolute inset-x-0 top-0 z-[60] h-10 border-b border-border/50 bg-background/95 backdrop-blur">
          <div
            className="absolute inset-0 right-[132px]"
            data-tauri-drag-region
          />
          <div
            className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-[11px] font-medium text-muted-foreground"
            data-tauri-drag-region
          >
            Atomic Chat
          </div>
          <WindowControls />
        </div>
      )}
      <div className={customChrome ? 'size-full pt-10' : 'size-full'}>
        {children}
      </div>
    </div>
  )
}

const AppLayout = () => {
  const { showOnboardingModelReminder } = useOnboardingModelReminder()
  const isLeftPanelOpen = useLeftPanel((state) => state.open)
  const setLeftPanel = useLeftPanel((state) => state.setLeftPanel)
  const sidebarWidth = useLeftPanel((state) => state.width)
  const setLeftPanelWidth = useLeftPanel((state) => state.setLeftPanelWidth)
  // Feeds live server / model / RAM state into the desktop system tray.
  // No-op outside macOS and Windows Tauri builds (see hook implementation).
  useTrayStatusSync()
  const isSetupCompleted = useSetupCompleted()

  return (
    <WindowFrame>
      <div className="bg-neutral-50 dark:bg-background size-full relative">
        <SidebarProvider
          open={isLeftPanelOpen}
          onOpenChange={setLeftPanel}
          defaultWidth={sidebarWidth}
          onWidthChange={setLeftPanelWidth}
        >
          <AnalyticProvider />
          <KeyboardShortcutsProvider />
          <DialogAppUpdater />
          {isSetupCompleted && <BackendUpdater />}
          {/* Unlike the recommendation dialogs above, this dialog only opens
              after ChatInput dispatches a mismatch prompt. Keep it mounted for
              upgraded/legacy users whose setup-completed flag is absent. */}
          <SuboptimalBackendDialog />
          <WhatsNewDialog />
          <LeftSidebar />
          <SidebarInset>
            <div className="bg-neutral-50 dark:bg-background size-full">
              <Outlet />
            </div>
          </SidebarInset>

          {/* Попап согласия на аналитику отключён; настройки → Privacy по-прежнему доступны */}
          {/* {productAnalyticPrompt && <PromptAnalytic />} */}
          {showOnboardingModelReminder && <PromptOnboardingModel />}
        </SidebarProvider>
      </div>
    </WindowFrame>
  )
}

const LogsLayout = () => {
  return (
    <WindowFrame>
      <Fragment>
        <main className="relative h-full text-sm antialiased select-text bg-app">
          <div className="flex h-full">
            {/* Main content panel */}
            <div className="h-full flex w-full">
              <div className="bg-background text-foreground border w-full overflow-hidden">
                <Outlet />
              </div>
            </div>
          </div>
        </main>
      </Fragment>
    </WindowFrame>
  )
}

function RootLayout() {
  const getInitialLayoutType = () => {
    const pathname = window.location.pathname
    return (
      pathname === route.localApiServerlogs ||
      pathname === route.systemMonitor ||
      pathname === route.appLogs
    )
  }

  useEffect(() => {
    // Wait for the UI to be fully rendered before hiding the loader
    const hideLoader = () => {
      requestAnimationFrame(() => {
        // Hide the HTML loader
        document.body.classList.add('loaded')

        // Remove the HTML loader element after transition
        const loader = document.getElementById('initial-loader')
        if (loader) {
          setTimeout(() => {
            loader.remove()
          }, 300)
        }
      })
    }

    // Give providers time to initialize and paint
    const timer = setTimeout(hideLoader, 200)

    return () => clearTimeout(timer)
  }, [])

  const IS_LOGS_ROUTE = getInitialLayoutType()

  return (
    <Fragment>
      <ServiceHubProvider>
        <ThemeProvider />
        <InterfaceProvider />
        <ToasterProvider />
        <TranslationProvider>
          <ExtensionProvider>
            <DataProvider />
            <GlobalEventHandler />
            <StartupBackendCoordinator />
            {IS_LOGS_ROUTE ? <LogsLayout /> : <AppLayout />}
          </ExtensionProvider>
          {/* <TanStackRouterDevtools position="bottom-right" /> */}
          <ToolApproval />
          <AgentApprovalDialog />
          <AgentFolderAccessDialog />
          <AttachmentIngestionDialog />
          <OutOfContextPromiseModal />
        </TranslationProvider>
      </ServiceHubProvider>
    </Fragment>
  )
}
