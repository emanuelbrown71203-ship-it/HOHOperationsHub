export default function Stars({ value, onChange, size = 'md' }: { value: number; onChange?: (v: number) => void; size?: 'sm' | 'md' | 'lg' }) {
  return (
    <div className={`stars stars-${size}`} role={onChange ? 'radiogroup' : 'img'} aria-label={onChange ? 'Rating' : `${value} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) =>
        onChange ? (
          <button key={n} type="button" role="radio" aria-checked={value === n} aria-label={`${n} star${n > 1 ? 's' : ''}`} className={n <= value ? 'on' : ''} onClick={() => onChange(n)}>
            ★
          </button>
        ) : (
          <span key={n} className={n <= value ? 'on' : ''} aria-hidden="true">★</span>
        ),
      )}
    </div>
  );
}

export const RATING_WORDS = ['', 'Needs a lot of work', 'Below expectations', 'Okay', 'Good setup', 'Excellent setup'];
