# AVA: визуальная проверка 2026-11-01, проход 2

**Локальный source проверен и заморожен для передачи владельцу релиза.** Этот отчет описывает патч поверх documentation HEAD `e0bf9bca060e63bc698eb14a6a89f968dc8421c0` и опубликованного UI `0ef0a1f5c50bc1762ad95f41a534ca530e1f9a0f`. Итоговые commit, deployment и независимая live приемка находятся в [общем release report](https://github.com/IMONsergey/LuxuryRealty/blob/main/docs/MOTION-RELEASE-2026-11-01.md). Исторические server jobs из [MOTION-QA](MOTION-QA-2026-11-01.md) сохранены отдельно от этой новой cloud проверки.

Fingerprint проверенного приложения, включая `src/**` и package manifests: `91f0873dd3939a2e5a38f64e0f23af1d0f51b53745e322b5cc0d57e3bd1cdac8`. Алгоритм, hashes файлов, версии и измерения сохранены в [verification.json](verification/design-2026-11-01/verification.json).

## Область и исходный дизайн

Проверены `/`, `/residences/801/`, `/residences/1601/`, `/location/`, `/privacy/` и настоящий отсутствующий маршрут `/audit-missing-route/` с HTTP404. Основная viewport матрица: 1440x900, 1920x1080, 1024x768, 768x1024, 390x844, 320x740 и 844x390. Главная снята по hero, architecture, Haven, film poster, Sky Palace, residences, interiors, features, location, closing, partners и footer. Внутренние страницы сняты последовательными viewport фрагментами. После image и tablet typography правок дополнительно пересняты фотографии на всех семи размерах. Найденные на этом этапе два пересечения copy/CTA затем исправлены и пересняты отдельно на семи ширинах в обоих движках.

Сохранены фотографии, локальные Catalina Village/SF UI/Graphik/Inter, цвета, асимметричная композиция и исходное кадрирование. Источники: [оригинальный AVA frame](https://www.figma.com/design/m3N3lJCoutaziEm4nt4CwO/?node-id=1-1690), [подготовленный desktop](https://www.figma.com/design/m3N3lJCoutaziEm4nt4CwO/?node-id=2028-382), [mobile](https://www.figma.com/design/m3N3lJCoutaziEm4nt4CwO/?node-id=2038-696), [provenance](../README.md#design-provenance), [asset map](../src/data/assets.json).

## Подтвержденные дефекты и исправления

1. **Текстовые стрелки и control glyphs.** Arrow/close/plus/minus в управляющих элементах заменены `Icon.astro`. Arrow и plus используют исходные контуры `nav-2.svg` и `hero-preview-left-2.svg`; preview circles используют целый исходный SVG. Заданы явные размеры, `viewBox`, `currentColor` и `aria-hidden`. Авторские CSS линии/plus остаются геометрией. Source scan20 файлов и runtime text/pseudo-element scan не нашли текстовых стрелок.
2. **Потеря места чтения.** До правки reduced motion на390px сбрасывал Chromium с y6419 к0, WebKit с5856 к0. Guard сохраняет секцию перед GSAP matchMedia revert и восстанавливает после refresh; stable anchor также переживает resize. Исправлена субпиксельная граница bottom295.390625/probe295.4, из-за которой вместо gallery выбирался следующий Features и появлялся скачок273px. Запас2px удерживает probe в исходной секции.
3. **Next застревал на отказавшем изображении.** Requested index отделен от displayed index. После ошибки второго кадра доступен третий; Previous повторяет загрузку нового img с прежними src/srcset/sizes/alt. DOM меняется после decode и проверки последнего запроса. Pending/failure сохраняет предыдущую видимую фотографию и ее счетчик.
4. **Неверный выбор responsive bitmap.** Mobile gallery высотой440px получала480w bitmap высотой270-276px; теперь `sizes` учитывает высоту и исходный crop. Аналогично исправлены Haven bedroom/city/water, film poster, sky-above, aerial на главной и внутренней Location, waterfront и evening. Например, aerial320 выбирал480w при потребности606-706w; sky-above1920 выбирал800w при1311w. Использованы существующие варианты, без новых assets или изменения CSS crop. Финальная проверка декодирует выбранный resource отдельно, учитывает реальную геометрию и предел оригинала. Намеренный blur architecture фона сохранен.
5. **Film action при отсутствии файла.** Без `PUBLIC_AVA_FILM_URL` CTA называется Request the film и открывает существующую форму с context `The Sky Palace / Film request`. При наличии URL сохранены Watch video и video action. Проверен фактический branch текущей сборки без URL. Позиция, poster и исходный Action сохранены.
6. **Close уходил вместе с длинным содержимым.** Privacy form на320x740 уводила Close с top30 к-132; на844x390 с46 к-452. Открытое mobile menu после поворота уводило Close с24 к-295. Теперь прокручивается внутренний контент, а Close остается на исходных координатах. Новое открытие возвращает scroller к началу, сохраняя введенные поля и pending lifecycle.
7. **Success наследовал прокрутку формы.** После pending/error на коротком экране success мог начинаться с inner scroll291 и заголовка top-107. Focus использует `preventScroll`, затем внутренний scroller сбрасывается. Верх success виден, повторная отправка и reference validation сохранены.
8. **Узкая Privacy типографика.** До352px размер существующего h1 плавно уменьшается44-40px, чтобы Information помещалось внутри поля. Размеры390px и desktop сохранены.
9. **COMPARE обрезалось в enquiry768/844.** Фиксированные70px выносили слово за overflow-hidden editorial column: на768 его правый край393.5 при границе338.27. Только в диапазоне768-1000px добавлен font clamp48-70. Три исходные строки остаются целыми, desktop1024+ и mobile не затронуты.
10. **Микротекст на планшете.** На768px body Interiors/Location был8.53px, Partners6.93px; независимый просмотр1:1 подтвердил нечитаемость. Body получает14px только768-1100. Gallery copy остается внутри прежнего фото через нижнее позиционирование. Location сохраняет две колонки и размеры фотографии, но правая колонка идет естественным потоком. Карточки Partners и footer формируют достаточную высоту. Семейства, цвета и заголовки сохранены.
11. **Светлый gallery кадр терял title/counter.** Только overlay title и counter получили мягкую тень. Фотографии не затемнялись. Первый темный и второй светлый кадры повторно сняты и просмотрены в обоих движках, включая390,768 и1440.
12. **CTA перекрывали tablet paragraph.** На768px Architecture и Sky action проходили через последние строки copy. Только768-1100px текст и соответствующий CTA объединены в естественный поток с зазором24px. На других ширинах wrappers используют `display:contents`, сохраняя исходное позиционирование. Architecture paragraph расширен в пределах прежней правой области; его CTA не заходит на следующий Haven кадр. Первая Sky итерация убрала overlap, но поместила подпись на skyline. Независимый просмотр обнаружил этот контрастный риск. Минимальная ширина Sky paragraph300px сокращает строки и возвращает CTA на светлое небо, сохраняя начало текста, шрифты, цвета и фото. Финальные settled768/844 кадры проверены отдельно.

Подозрение на clipping строки THE PEAK проверено отдельно: baseline совпадает с границей poster/blue, но settled element capture и цепочка overflow не показали CSS clipping. Фактические метрики `49px Catalina Village`: ascent34/descent1. Авторское наложение сохранено. Ранний кадр формы во время entrance заменен settled capture с opacity1 и подтвержденным context.

## Итоговые проверки

| Проверка | Фактический результат |
| --- | --- |
| Финальный typecheck и чистый build | PASS;0 errors,0 warnings,1 прежний unused-import hint в API test |
| Все маршруты, семь размеров |42 cases,207 viewport captures,0 runtime arrow matches/errors/violations |
| Значимые UI состояния |54 группы:42 Chromium по семи размерам и12 WebKit390/landscape;177 screenshots |
| Existing `scripts/browser-qa.mjs` на итоговом source |1440/768/390/320 и отдельный normal-motion flow PASS |
| Gallery decode/error/rapid motion |3 сценария в каждом движке,6/6 PASS |
| Native Close/reopen/editorial |320/768/844 в обоих движках,12/12 PASS |
| Точное место чтения, обе preferences и resize |5 сценариев в каждом движке,10/10 PASS |
| Tablet text/контраст/геометрия |390/768/844/1024/1100/1101/1440 в обоих движках,14/14 PASS |
| Финальный copy/CTA flow и hit testing |Те же семь ширин, оба движка:14/14 PASS |
| Source quality наDPR1 |320/768/1024/1440/1920,главная и Location,оба движка:20/20 PASS |
| Дополнительная photo матрица |7 размеров,77 свежих viewport кадров; выявленные copy/CTA overlaps закрыты последующим focused прогоном |
| Выбранные доказательные screenshots |6/6 на окончательном source,API0,pageErrors0 |
| Syntax и `git diff --check` |PASS |

**Граница версий:** широкие42 route cases и54 группы состояний сняты перед поздними `sizes`, enquiry editorial и tablet/overlay typography правками. Image20/20 и native dialogs12/12 относятся к окончательному коду изображений/диалогов, который после них не менялся. Text layout14/14 и77 дополнительных кадров предшествуют последней правке Sky width; на этих77 кадрах были найдены два copy/CTA overlaps. Их заменяют14 focused copy/CTA cases на окончательном fingerprint выше. Финальные clean check/build, reading10/10, existing suite и6 выбранных screenshots также относятся к этому fingerprint. Галерейный JavaScript после6/6 gallery suite не менялся. Старые captures не объявлены новым прогоном.

Покрыты реальные anchors/hotspots, menu/focus, body/html locks, invalid/error/pending/success формы, privacy message, gallery normal/reduced/rapid/error, feature disclosure и film request. Для801 и1601 проверены соответствующие планы, zoom, resize, fit, восстановление focus и pointercancel после настоящего mouse drag. Cancel плана синтетический; Chromium native touch cancellation проверен отдельно. WebKit wheel выполнялся в desktop context на узком viewport.

При позднем rebuild тест обнаружил старый HTML с предыдущим CSS, хотя новый CSS уже был сгенерирован. Outputs/cache сохранены отдельно; выполнен чистый build. До финальных тестов проверены hashes действительно отданных HTML/CSS и наличие новых `sizes`. Этот диагностический FAIL сохранен как stale-build case и не назван pass нового интерфейса. [verification.json](verification/design-2026-11-01/verification.json) содержит build provenance и hashes raw reports.

Все контактные листы просмотрены, подозрительные и выбранные кадры открыты в полном размере. Полные before/after/repro reports находятся в `artifacts/pixel-audit-20261101-v2/`. Для повторения используются `scripts/browser-qa.mjs`, `gallery-qa.mjs`, `dialog-qa.mjs`, `text-layout-qa.mjs` и `image-quality-qa.mjs`; runtime/base/output можно передать через environment.

## Выбранные итоговые кадры

| Кадр | Проверяемая область |
| --- | --- |
| [Hero1440](verification/design-2026-11-01/hero-desktop1440.jpg) | Исходная композиция и typography |
| [Sky CTA768](verification/design-2026-11-01/sky-cta-tablet768.jpg) | Целый paragraph, чистый зазор и читаемый CTA на небе |
| [Location768](verification/design-2026-11-01/location-tablet768.jpg) | Читаемый body, доступный CTA, source quality |
| [Plan1601](verification/design-2026-11-01/plan1601-desktop1440.jpg) | План и SVG zoom controls |
| [Gallery390](verification/design-2026-11-01/gallery-motion-mobile390.jpg) | Светлый кадр, SVG controls, normal/reduced continuity |
| [Film request320](verification/design-2026-11-01/film-request-mobile320.jpg) | Settled форма, context и постоянный Close |

## Границы результата

Node24.22.1, Playwright1.58.2, Linux Chromium145.0.7632.6/WebKit26.0; закреплены Astro7.4.4, GSAP3.15.0 и TypeScript6.0.3. Runtime GSAP hooks `matchMediaInit`/`matchMedia` нужны для порядка capture/revert/refresh; их узкая типизация документирует API закрепленной версии. Lockfile не менялся.

Все текущие enquiries mocked/blocked. Private Blob и историческое production подтверждение относятся к предыдущему релизу; новый storage receipt не создавался. Не заявляются physical Safari/iOS, физический pinch, FPS/INP или точное совпадение каждого motion frame с Figma. Исходные разрешения фотографий остаются пределом качества: например, первая gallery1024w, aerial1024w и намеренно размытый architecture фон540w. Исправленный выбор candidates может увеличить загрузку относительно ошибочного480w; прежние loading measurements не являются замером этого патча. Ограничения на полный фильм/PDF, актуальные цены и live inventory сохранены.
