# Math fixture

A simple inline expression: $a^2 + b^2 = c^2$ should render with KaTeX.

Display math:

$$
\int_{-\infty}^{\infty} e^{-x^2} \, dx = \sqrt{\pi}
$$

A second block:

$$
\frac{\partial f}{\partial x} = \lim_{h \to 0} \frac{f(x + h) - f(x)}{h}
$$

Mixed paragraph: when $x = 0$, the function returns $f(0) = 1$.

Inside fenced code, math should NOT render:

```
$x^2 + y^2$
```

Inside inline code, also not: `$x = 5$` stays raw.

Edge: prices like $5.99 should not look like math (whitespace before number).
