https://iextrading.com/developer/docs/#chart
https://github.com/d3/d3/blob/master/API.md
## Markup

`./docs/`

## Source files

`./src/`

## Checklist

markups | [landing #1](https://al4str.github.io/spb-test/landing-gridless-pixel-perfect-approach.html) | [landing #2](https://al4str.github.io/spb-test/landing-bootstrap-grid.html) | [landing #3](https://al4str.github.io/spb-test/landing-css-grid-systematic-approach.html) | [data table](https://al4str.github.io/spb-test/table.html)
--- | :---: | :---: | :---: | :---:
grid system | without any | bootstrap grid | css grid | just a table
approach | pixel-perfect | as is | systematic | as is
loop through links/controls with tab | ✖️ | ✖️ | ✔️️ | ✔️
check a11y tree (chrome devtools) | ✖️ | ✖️ | ✔️️ | ✖️
check middle breakpoints | ✔️️ | ✔️ | ✔️️ | ✖️
check zooming behaviour | ✖️ | ✖️ | ✔️️ | ✖️
check text for mistakes | ✔️ | ✔️️ | ✔️️ | ✖️
process text with [Typograf](https://www.artlebedev.ru/tools/typograf/) | ✔️️ | ✔️️ | ✔️️ | ✖️
prefix css | ✔️ | ✔️️ | ✔️️ | ✔️
minimize css | ✔️️ | ✔️️ | ✔️️ | ✔️️
get rid of css source maps | ✔️️ | ✔️ | ✔️️ | ✔️
use minified vendor libraries | ✔️️ | ✔️️ | ✔️️ | ✔️️
optimize assets [`.png`](https://tinypng.com/), [`.jpeg`](https://tinyjpg.com/) | ✔️ | ✔️️ | ✔️️ | ✖️
add `<linl rel="preload/preconnect" href="..." />` tags | ✔️️ | ✔️ | ✔️️ | ✖️
add meta tags [open graph](http://ogp.me/) | ✖️ | ✖️ | ✖️ | ✖️
add microdata [schema.org](https://schema.org/) | ✖️ | ✖️ | ✖️ | ✖️
check page in [PageSpeed Insights](https://developers.google.com/speed/pagespeed/insights/) | ✖️ | ✖️ | ✖️️️ | ✖️
check page in lighthouse (chrome devtools) | ✖️ | ✖️ | ✔️️ | ✖️

### Landing #3 lighthouse results

![](https://github.com/al4str/spb-test/raw/master/lighthouse.jpg "lighthouse results")
