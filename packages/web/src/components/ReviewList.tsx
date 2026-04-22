import type { ReviewRequest } from "../types";
import { FocusLi } from "./FocusLi";
import { PrCard } from "./PrCard";

interface Props {
  reviews: ReviewRequest[];
  focusIndex: number;
  isFocusedSection: boolean;
}

export function ReviewList({ reviews, focusIndex, isFocusedSection }: Props) {
  if (reviews.length === 0) {
    return (
      <p className="py-4 text-center text-sm text-muted-foreground">
        No pending reviews
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {reviews.map((pr, i) => {
        const focused = isFocusedSection && focusIndex === i;
        return (
          <FocusLi key={pr.id} focused={focused}>
            <PrCard {...pr} focused={focused} />
          </FocusLi>
        );
      })}
    </ul>
  );
}
