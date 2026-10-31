"use client";

import { useState } from "react";
import { TrackedLink } from "@/components/homepage-cta-link";
import type { HomepageModel } from "@/lib/homepage-content";
import { quizRead, type QuizAnswers } from "@/lib/homepage-quiz";

export function HomepageQuiz({
  questions,
  quiz,
  bookHref,
  bookLabel,
}: {
  questions: HomepageModel["questions"];
  quiz: HomepageModel["quiz"];
  bookHref: string;
  bookLabel: string;
}) {
  const [answers, setAnswers] = useState<QuizAnswers>({});
  const lines = quizRead(answers);

  return (
    <form
      className="qbox rv"
      onSubmit={(event) => event.preventDefault()}
      onChange={(event) => {
        const target = event.target;
        if (!(target instanceof HTMLInputElement) || target.type !== "radio") return;
        const name = target.name as keyof QuizAnswers;
        setAnswers((current) => ({ ...current, [name]: target.value }));
      }}
    >
      {questions.map((question) => (
        <fieldset key={question.name}>
          <legend>{question.legend}</legend>
          <div className="opts">
            {question.options.map((option) => (
              <label key={option.value}>
                <input type="radio" name={question.name} value={option.value} />
                <span>{option.label}</span>
              </label>
            ))}
          </div>
        </fieldset>
      ))}
      <div className={lines ? "qres show" : "qres"} aria-live="polite">
        {lines ? (
          <>
            <span className="mono lab">{quiz.resultKicker}</span>
            <h3>{quiz.resultTitle}</h3>
            <ul>
              {lines.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            <TrackedLink className="btn" href={bookHref} cta="book-demo-quiz">
              {bookLabel} to go through it
            </TrackedLink>
          </>
        ) : null}
      </div>
    </form>
  );
}
