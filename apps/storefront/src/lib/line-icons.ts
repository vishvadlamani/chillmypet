/**
 * Line icons by name, drawn in the text colour at one stroke weight, so the
 * benefit cards and the trust strip read as one set. Inner SVG markup for a
 * 24×24 viewBox; the element wrapping them sets the stroke.
 */
export const LINE_ICONS: Record<string, string> = {
	mail: '<rect x="3.5" y="5.5" width="17" height="13" rx="2"/><path d="m4 7 8 6 8-6"/>',
	parcel: '<path d="M12 3 4 7v10l8 4 8-4V7l-8-4Z"/><path d="m4 7 8 4 8-4M12 11v10M8 5l8 4"/>',
	lock: '<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/>',
	return: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
	truck:
		'<path d="M3 6.5h11v9H3zM14 9.5h4l3 3v3h-7"/><circle cx="7" cy="17.5" r="1.8"/><circle cx="17.5" cy="17.5" r="1.8"/>'
};
