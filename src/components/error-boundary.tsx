"use client";

import React, { Component, ErrorInfo, ReactNode } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  public static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error caught by ErrorBoundary:", error, errorInfo);
    this.setState({ error, errorInfo });
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    if (this.props.onReset) {
      this.props.onReset();
    } else {
      window.location.reload();
    }
  };

  private handleCopy = () => {
    const details = `Error: ${this.state.error?.message || "Unknown error"}\n\nStack:\n${this.state.error?.stack || ""}\n\nComponent Stack:\n${this.state.errorInfo?.componentStack || ""}`;
    navigator.clipboard.writeText(details);
  };

  public render() {
    if (this.state.hasError) {
      const isDev = Boolean(import.meta.env?.DEV);

      if (!isDev) {
        return (
          <div className="flex min-h-[220px] w-full items-center justify-center p-6">
            <Card className="max-w-md border shadow-sm">
              <CardHeader className="flex flex-row items-center gap-3 space-y-0 pb-2">
                <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0" />
                <div>
                  <CardTitle className="text-sm font-semibold">
                    Unable to display this view
                  </CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    An unexpected issue occurred while rendering. Your saved project data remains safe.
                  </p>
                </div>
              </CardHeader>
              <CardFooter className="flex justify-end pt-3 border-t">
                <Button type="button" variant="default" size="sm" onClick={this.handleReset} className="text-xs gap-1.5">
                  <RotateCcw className="h-3.5 w-3.5" />
                  Reload View
                </Button>
              </CardFooter>
            </Card>
          </div>
        );
      }

      return (
        <div className="flex min-h-[300px] w-full items-center justify-center p-6">
          <Card className="max-w-2xl border-destructive/50 bg-destructive/5 shadow-lg">
            <CardHeader className="flex flex-row items-center gap-3 space-y-0 pb-3">
              <AlertTriangle className="h-6 w-6 text-destructive shrink-0" />
              <div>
                <CardTitle className="text-base text-destructive font-semibold">
                  {this.props.fallbackTitle || "Something went wrong rendering this view"}
                </CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  [Dev Mode] An unhandled error occurred. The details are captured below.
                </p>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded bg-background p-3 border font-mono text-xs text-destructive break-words max-h-40 overflow-auto">
                {this.state.error?.toString()}
              </div>
              {this.state.error?.stack && (
                <details className="text-xs text-muted-foreground">
                  <summary className="cursor-pointer font-medium hover:text-foreground">
                    View Call Stack
                  </summary>
                  <pre className="mt-2 rounded bg-muted/50 p-2 text-[11px] overflow-auto max-h-48 whitespace-pre-wrap">
                    {this.state.error.stack}
                  </pre>
                </details>
              )}
              {this.state.errorInfo?.componentStack && (
                <details className="text-xs text-muted-foreground">
                  <summary className="cursor-pointer font-medium hover:text-foreground">
                    View Component Stack
                  </summary>
                  <pre className="mt-2 rounded bg-muted/50 p-2 text-[11px] overflow-auto max-h-48 whitespace-pre-wrap">
                    {this.state.errorInfo.componentStack}
                  </pre>
                </details>
              )}
            </CardContent>
            <CardFooter className="flex items-center justify-between border-t pt-3">
              <Button type="button" variant="outline" size="sm" onClick={this.handleCopy} className="text-xs">
                Copy Error Details
              </Button>
              <Button type="button" variant="default" size="sm" onClick={this.handleReset} className="text-xs gap-1.5">
                <RotateCcw className="h-3.5 w-3.5" />
                Reload / Recover
              </Button>
            </CardFooter>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}
