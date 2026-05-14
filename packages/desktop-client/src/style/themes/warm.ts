// Warm Ledger theme — designed for extended use without eye strain.
// Muted sage greens and warm parchment neutrals. No cold blues, no harsh whites.
// Palette derived from antique ledger books and natural materials.

// ─── Palette ─────────────────────────────────────────────────────────────────
const bg = '#F3F0EA'; // page background
const surface = '#F8F5F0'; // lighter surface — card / input fields
const surfaceAlt = '#ECE7DE'; // slightly more toned — table rows, hover
const border = '#D8D1C7'; // borders
const textPrimary = '#2F312D'; // primary text
const textSecondary = '#66675F'; // muted / label text
const textSubdued = '#A4A49C'; // subdued / placeholder
const primary = '#7B8D6D'; // sage green accent
const primaryHover = '#6F8664'; // darker sage (credit / positive)
const primarySoft = '#E5EBE1'; // light sage background
const debit = '#9A6B5A'; // warm rust — negative / error
const pending = '#A4884E'; // amber — warning / underfunded
const infoMin = '#7E8574'; // muted sage-gray — info

// ─── Page ────────────────────────────────────────────────────────────────────
export const pageBackground = bg;
export const pageBackgroundModalActive = surfaceAlt;
export const pageBackgroundTopLeft = bg;
export const pageBackgroundBottomRight = bg;
export const pageBackgroundLineTop = surface;
export const pageBackgroundLineMid = bg;
export const pageBackgroundLineBottom = surfaceAlt;
export const pageText = textPrimary;
export const pageTextLight = textSecondary;
export const pageTextSubdued = textSubdued;
export const pageTextDark = '#1A1C18';
export const pageTextPositive = primaryHover;
export const pageTextLink = '#5B6FAD';
export const pageTextLinkLight = '#8B9CC8';

// ─── Card ────────────────────────────────────────────────────────────────────
export const cardBackground = surface;
export const cardBorder = border;
export const cardShadow = '#C4BDB5';

// ─── Table ───────────────────────────────────────────────────────────────────
// Rows sit on surfaceAlt; inputs are surface (lighter) so fields are always visible
export const tableBackground = surfaceAlt;
export const tableInputBackground = surface;
export const tableInputBorder = border;
export const tableRowBackgroundAlt = '#f0ede7';
export const tableRowBackgroundHover = '#D8D1C7';
export const tableText = textPrimary;
export const tableTextLight = textSecondary;
export const tableTextSubdued = textSubdued;
export const tableTextSelected = '#3A3D38';
export const tableTextHover = '#1A1C18';
export const tableTextInactive = textSecondary;
export const tableHeaderText = textSecondary;
export const tableHeaderBackground = bg;
export const tableBorder = border;
export const tableBorderSelected = primary;
export const tableBorderHover = primaryHover;
export const tableBorderSeparator = border;
export const tableRowBackgroundHighlight = primarySoft;
export const tableRowBackgroundHighlightText = '#2A3A25';
export const tableRowHeaderBackground = bg;
export const tableRowHeaderText = textSecondary;

// ─── Numbers ─────────────────────────────────────────────────────────────────
export const numberPositive = primaryHover;
export const numberNegative = debit;
export const numberNeutral = textSubdued;
export const budgetNumberNegative = numberNegative;
export const budgetNumberZero = textSubdued;
export const budgetNumberNeutral = textPrimary;
export const budgetNumberPositive = budgetNumberNeutral;
export const templateNumberFunded = numberPositive;
export const templateNumberUnderFunded = pending;
export const toBudgetPositive = numberPositive;
export const toBudgetZero = numberPositive;
export const toBudgetNegative = budgetNumberNegative;

// ─── Sidebar ─────────────────────────────────────────────────────────────────
export const sidebarBackground = textPrimary;
export const sidebarItemBackgroundPending = pending;
export const sidebarItemBackgroundPositive = primaryHover;
export const sidebarItemBackgroundFailed = debit;
export const sidebarItemBackgroundHover = '#1A1C18';
export const sidebarItemAccentSelected = primary;
export const sidebarItemBackgroundSelected = '#1E2E1B';
export const sidebarItemText = '#D4D0CA';
export const sidebarItemTextSelected = '#A8C49C';
export const sidebarBudgetName = '#D4D0CA';
export const sidebarDivider = '#1A1C18';

// ─── Menu ────────────────────────────────────────────────────────────────────
export const menuBackground = surface;
export const menuItemBackground = bg;
export const menuItemBackgroundHover = surfaceAlt;
export const menuItemText = textPrimary;
export const menuItemTextHover = textPrimary;
export const menuItemTextSelected = primary;
export const menuItemTextHeader = textSecondary;
export const menuBorder = border;
export const menuBorderHover = primary;
export const menuKeybindingText = textSecondary;
export const menuAutoCompleteBackground = textPrimary;
export const menuAutoCompleteBackgroundHover = '#3A3D38';
export const menuAutoCompleteText = '#D4D0CA';
export const menuAutoCompleteTextHover = '#A8C49C';
export const menuAutoCompleteTextHeader = '#C4A058';
export const menuAutoCompleteItemTextHover = menuAutoCompleteText;
export const menuAutoCompleteItemText = menuAutoCompleteText;

// ─── Modal ───────────────────────────────────────────────────────────────────
export const modalBackground = surface;
export const modalBorder = border;
export const mobileHeaderBackground = '#3A3D38';
export const mobileHeaderText = surface;
export const mobileHeaderTextSubdued = '#B4B0AA';
export const mobileHeaderTextHover = 'rgba(180, 176, 170, .15)';
export const mobilePageBackground = surface;
export const mobileNavBackground = surface;
export const mobileNavItem = textSecondary;
export const mobileNavItemSelected = primary;
export const mobileAccountShadow = '#C4BDB5';
export const mobileAccountText = primaryHover;
export const mobileTransactionSelected = primary;
export const mobileViewTheme = mobileHeaderBackground;
export const mobileConfigServerViewTheme = '#3A3D38';

// ─── Markdown ────────────────────────────────────────────────────────────────
export const markdownNormal = border;
export const markdownDark = textSecondary;
export const markdownLight = '#E0DDD7';

// ─── Buttons ─────────────────────────────────────────────────────────────────
export const buttonMenuText = textPrimary;
export const buttonMenuTextHover = textPrimary;
export const buttonMenuBackground = 'transparent';
export const buttonMenuBackgroundHover = 'rgba(123, 141, 109, .15)';
export const buttonMenuBorder = border;
export const buttonMenuSelectedText = primaryHover;
export const buttonMenuSelectedTextHover = '#4A5E42';
export const buttonMenuSelectedBackground = primarySoft;
export const buttonMenuSelectedBackgroundHover = '#D8E5D4';
export const buttonMenuSelectedBorder = buttonMenuSelectedBackground;

export const buttonPrimaryText = surface;
export const buttonPrimaryTextHover = buttonPrimaryText;
export const buttonPrimaryBackground = primary;
export const buttonPrimaryBackgroundHover = primaryHover;
export const buttonPrimaryBorder = buttonPrimaryBackground;
export const buttonPrimaryShadow = 'rgba(123, 141, 109, 0.25)';
export const buttonPrimaryDisabledText = surface;
export const buttonPrimaryDisabledBackground = textSubdued;
export const buttonPrimaryDisabledBorder = buttonPrimaryDisabledBackground;

export const buttonNormalText = textPrimary;
export const buttonNormalTextHover = buttonNormalText;
export const buttonNormalBackground = surface;
export const buttonNormalBackgroundHover = surfaceAlt;
export const buttonNormalBorder = border;
export const buttonNormalShadow = 'rgba(47, 49, 45, 0.08)';
export const buttonNormalSelectedText = surface;
export const buttonNormalSelectedBackground = primary;
export const buttonNormalDisabledText = textSubdued;
export const buttonNormalDisabledBackground = buttonNormalBackground;
export const buttonNormalDisabledBorder = buttonNormalBorder;

export const calendarText = surface;
export const calendarBackground = textPrimary;
export const calendarItemText = '#D4D0CA';
export const calendarItemBackground = '#3A3D38';
export const calendarSelectedBackground = textSecondary;

export const buttonBareText = textPrimary;
export const buttonBareTextHover = textPrimary;
export const buttonBareBackground = 'transparent';
export const buttonBareBackgroundHover = 'rgba(123, 141, 109, .15)';
export const buttonBareBackgroundActive = 'rgba(123, 141, 109, .25)';
export const buttonBareDisabledText = textSubdued;
export const buttonBareDisabledBackground = buttonBareBackground;

// ─── Notices ─────────────────────────────────────────────────────────────────
export const noticeBackground = primarySoft;
export const noticeBackgroundLight = '#EFF4ED';
export const noticeBackgroundDark = primaryHover;
export const noticeText = primaryHover;
export const noticeTextLight = primary;
export const noticeTextDark = '#2A3A25';
export const noticeTextMenu = '#A5C49C';
export const noticeTextMenuHover = primarySoft;
export const noticeBorder = primary;
export const warningBackground = '#F5EDD8';
export const warningText = pending;
export const warningTextLight = '#C4A058';
export const warningTextDark = '#6A5520';
export const warningBorder = '#C4A058';
export const errorBackground = '#F5E8E4';
export const errorText = debit;
export const errorTextDark = '#7A4A3A';
export const errorTextDarker = '#5A2A1A';
export const errorTextMenu = '#D4A090';
export const errorBorder = debit;
export const upcomingBackground = primarySoft;
export const upcomingText = primaryHover;
export const upcomingBorder = '#A8C4A0';

// ─── Forms ───────────────────────────────────────────────────────────────────
export const formLabelText = primaryHover;
export const formLabelBackground = primarySoft;
export const formInputBackground = surface;
export const formInputBackgroundSelected = bg;
export const formInputBackgroundSelection = primary;
export const formInputBorder = border;
export const formInputTextReadOnlySelection = surfaceAlt;
export const formInputBorderSelected = primary;
export const formInputText = textPrimary;
export const formInputTextSelected = surface;
export const formInputTextPlaceholder = textSubdued;
export const formInputTextPlaceholderSelected = border;
export const formInputTextSelection = primarySoft;
export const formInputShadowSelected = '#A8C4A0';
export const formInputTextHighlight = primarySoft;
export const checkboxText = tableBackground;
export const checkboxBackgroundSelected = primary;
export const checkboxBorderSelected = primary;
export const checkboxShadowSelected = '#A8C4A0';
export const checkboxToggleBackground = textSubdued;
export const checkboxToggleBackgroundSelected = primary;
export const checkboxToggleDisabled = border;

// ─── Pills ───────────────────────────────────────────────────────────────────
export const pillBackground = border;
export const pillBackgroundLight = surfaceAlt;
export const pillText = textSecondary;
export const pillTextHighlighted = primary;
export const pillBorder = border;
export const pillBorderDark = '#C0B9AF';
export const pillBackgroundSelected = primarySoft;
export const pillTextSelected = '#2A3A25';
export const pillBorderSelected = primary;
export const pillTextSubdued = textSubdued;

// ─── Reports ─────────────────────────────────────────────────────────────────
export const reportsRed = '#C47A68';
export const reportsBlue = '#6B7FB8';
export const reportsGreen = primaryHover;
export const reportsGray = infoMin;
export const reportsLabel = textPrimary;
export const reportsInnerLabel = textSecondary;
export const reportsNumberPositive = numberPositive;
export const reportsNumberNegative = numberNegative;
export const reportsNumberNeutral = numberNeutral;
export const reportsChartFill = primaryHover;

// ─── Notes / tags ────────────────────────────────────────────────────────────
export const noteTagBackground = '#E8E4F0';
export const noteTagBackgroundHover = '#DDD9EA';
export const noteTagDefault = '#E8E4F0';
export const noteTagText = textPrimary;

// ─── Budget ──────────────────────────────────────────────────────────────────
export const budgetCurrentMonth = surface;
export const budgetOtherMonth = bg;
export const budgetHeaderCurrentMonth = surfaceAlt;
export const budgetHeaderOtherMonth = surfaceAlt;

// ─── Floating action bar ─────────────────────────────────────────────────────
export const floatingActionBarBackground = primary;
export const floatingActionBarBorder = primary;
export const floatingActionBarText = surface;

// ─── Tooltip ─────────────────────────────────────────────────────────────────
export const tooltipText = textPrimary;
export const tooltipBackground = surface;
export const tooltipBorder = border;

export const calendarCellBackground = surfaceAlt;

export const overlayBackground = 'rgba(47, 49, 45, 0.35)';

// ─── Charts ──────────────────────────────────────────────────────────────────
export const chartQual1 = '#7B8D6D'; // sage primary
export const chartQual2 = '#A4884E'; // amber
export const chartQual3 = '#6B7FB8'; // muted slate blue
export const chartQual4 = '#9A6B5A'; // rust
export const chartQual5 = '#9B7DAE'; // muted purple
export const chartQual6 = '#7E8574'; // sage-gray
export const chartQual7 = '#C4A058'; // light amber
export const chartQual8 = '#A0AACC'; // light slate
export const chartQual9 = '#C49088'; // light rust
