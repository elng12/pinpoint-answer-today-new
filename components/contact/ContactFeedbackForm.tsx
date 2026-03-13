"use client";

import { FormEvent, useState } from "react";
import { trackClientEvent } from "@/lib/analytics";

type FormState = {
  name: string;
  email: string;
  phone: string;
  puzzleNumber: string;
  message: string;
  website: string;
};

const INITIAL_STATE: FormState = {
  name: "",
  email: "",
  phone: "",
  puzzleNumber: "",
  message: "",
  website: "",
};

export function ContactFeedbackForm() {
  const [form, setForm] = useState<FormState>(INITIAL_STATE);
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  const updateField = (key: keyof FormState, value: string) => {
    setForm((current) => ({
      ...current,
      [key]: value,
    }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!form.message.trim()) {
      setStatus("error");
      setMessage("Please tell us what needs fixing or improving.");
      return;
    }

    setStatus("submitting");
    setMessage("");

    trackClientEvent("feedback_submit", {
      event_category: "engagement",
      event_label: form.puzzleNumber || "general",
    });

    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(form),
      });

      const payload = (await response.json()) as { message?: string };

      if (!response.ok) {
        throw new Error(payload.message || "Unable to send feedback right now.");
      }

      trackClientEvent("feedback_submit_success", {
        event_category: "engagement",
        event_label: form.puzzleNumber || "general",
      });
      setForm(INITIAL_STATE);
      setStatus("success");
      setMessage(payload.message || "Thanks. Your feedback has been received.");
    } catch (error) {
      trackClientEvent("feedback_submit_error", {
        event_category: "engagement",
        event_label: form.puzzleNumber || "general",
      });
      setStatus("error");
      setMessage(
        error instanceof Error ? error.message : "Unable to send feedback right now.",
      );
    }
  };

  const inputClassName =
    "contact-input";

  return (
    <form className="contact-form-card" onSubmit={handleSubmit}>
      <div className="contact-form-grid">
        <label className="contact-label">
          <span>Name (optional)</span>
          <input
            className={inputClassName}
            name="name"
            value={form.name}
            onChange={(event) => updateField("name", event.target.value)}
            placeholder="Your name"
          />
        </label>

        <label className="contact-label">
          <span>Email (optional)</span>
          <input
            className={inputClassName}
            name="email"
            value={form.email}
            onChange={(event) => updateField("email", event.target.value)}
            placeholder="you@example.com"
            type="email"
          />
        </label>

        <label className="contact-label">
          <span>Phone (optional)</span>
          <input
            className={inputClassName}
            name="phone"
            value={form.phone}
            onChange={(event) => updateField("phone", event.target.value)}
            placeholder="+1 (555) 123-4567"
          />
        </label>

        <label className="contact-label">
          <span>Puzzle number (optional)</span>
          <input
            className={inputClassName}
            name="puzzleNumber"
            value={form.puzzleNumber}
            onChange={(event) => updateField("puzzleNumber", event.target.value)}
            placeholder="e.g. 678"
          />
        </label>
      </div>

      <label className="contact-label">
        <span>Your feedback</span>
        <textarea
          className="contact-input contact-textarea"
          name="message"
          value={form.message}
          onChange={(event) => updateField("message", event.target.value)}
          placeholder="What should we improve?"
          required
        />
      </label>

      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          left: "-9999px",
          width: 1,
          height: 1,
          overflow: "hidden",
        }}
      >
        <label>
          Website
          <input
            autoComplete="off"
            name="website"
            tabIndex={-1}
            value={form.website}
            onChange={(event) => updateField("website", event.target.value)}
          />
        </label>
      </div>

      <div className="contact-submit-row">
        <p className="muted-small">No login required. Keep personal details minimal.</p>
        <button className="button-primary" disabled={status === "submitting"} type="submit">
          {status === "submitting" ? "Sending..." : "Send feedback"}
        </button>
      </div>

      {message ? (
        <p
          className={status === "error" ? "contact-status-error" : "contact-status-success"}
          role="status"
        >
          {message}
        </p>
      ) : null}
    </form>
  );
}
