"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { Icon } from "@/components/icon";
import { Robin } from "@/components/mascot";
import { Badge, Stage, buttonClass } from "@/components/ui";
import { appHandoffUrl, isHandheld, linkProblem } from "@/lib/auth/app-handoff";

type Where = { handheld: boolean; href: string; problem: ReturnType<typeof linkProblem> };

// The location and device never change while the page is open: read once.
let where: Where | null = null;
function read(): Where {
  where ??= {
    handheld: isHandheld(navigator.userAgent, navigator.maxTouchPoints ?? 0),
    href: appHandoffUrl(window.location.search, window.location.hash),
    problem: linkProblem(window.location.search, window.location.hash),
  };
  return where;
}
const subscribe = () => () => {};

/** The page body; see page.tsx. Before hydration (no location yet) it shows the stage alone. */
export function AppSignInHandoff() {
  const here = useSyncExternalStore(subscribe, read, () => null);

  return (
    <div className="space-y-6">
      <Stage>
        <Robin mood={here?.problem ? "curious" : "happy"} size={88} />
      </Stage>
      {here ? here.handheld ? <OnPhone here={here} /> : <OnComputer problem={here.problem} /> : null}
    </div>
  );
}

function OnPhone({ here }: { here: Where }) {
  return (
    <>
      <div className="space-y-2">
        <Badge tone="gray" icon="smartphone">
          Sign in
        </Badge>
        <h1 className="px-figure text-ink">{here.problem === "expired" ? "This link has expired" : "Finish in the app"}</h1>
        <p className="text-base leading-6 text-muted">
          {here.problem === "expired"
            ? "Sign-in links work once, for a short time. Open Budgts and send yourself a new one."
            : here.problem
              ? "This sign-in link didn't work. Open Budgts and send yourself a new one."
              : "Open Budgts to finish signing in on this phone."}
        </p>
      </div>
      <a href={here.href} className={buttonClass("primary", "w-full", "lg")}>
        Open the Budgts app
        <Icon name="forward" />
      </a>
      <p className="text-sm leading-5 text-muted">
        Asked for the link on another phone? Open the email there.{" "}
        <Link href="/sign-in" className="font-medium text-ink underline decoration-silver underline-offset-4 hover:decoration-ink">
          Sign in on the web
        </Link>{" "}
        instead.
      </p>
    </>
  );
}

function OnComputer({ problem }: { problem: Where["problem"] }) {
  return (
    <>
      <div className="space-y-2">
        <Badge tone="gray" icon="smartphone">
          Budgts app
        </Badge>
        <h1 className="px-figure text-ink">Open this link on your phone</h1>
        <p className="text-base leading-6 text-muted">
          {problem === "expired"
            ? "This sign-in link is for the Budgts app, and it has expired. On your phone, open Budgts and send yourself a new one."
            : "This sign-in link is for the Budgts app. Open the email on the phone where you asked for it and tap the link there."}
        </p>
      </div>
      <div className="px-band space-y-3 p-2">
        <p className="text-sm leading-5 text-muted">
          To use Budgts in this browser, or to delete your account, sign in on the web instead.
        </p>
        <Link href="/sign-in" className={buttonClass("secondary", "w-full", "lg")}>
          Sign in on the web
          <Icon name="forward" />
        </Link>
      </div>
    </>
  );
}
