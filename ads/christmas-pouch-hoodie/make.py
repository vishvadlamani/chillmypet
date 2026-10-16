"""Build the Christmas Pouch Hoodie ad creatives from the page's own photos.

Run from the repo root: python3 ads/christmas-pouch-hoodie/make.py
Writes reel.mp4 (9:16), square.jpg (1:1) and portrait.jpg (4:5) next to this
file. Every claim on them is one the landing page already makes, so a click
lands on exactly what the ad showed: same hoodie, same price, same promises.
"""
import subprocess
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = Path(__file__).parent
SRC = HERE.parent.parent / 'landing' / 'christmas-pouch-hoodie'
FONT = '/usr/share/fonts/opentype/inter/Inter-{}.otf'

CREAM = (255, 249, 240)
GREEN = (23, 61, 43)
GOLD = (237, 186, 0)
RED = (176, 0, 32)
INK = (17, 17, 17)

RED_SANTA = Image.open(SRC / 'red_santa.jpg').convert('RGB')
GREEN_STOCKING = Image.open(SRC / 'green_stocking.jpg').convert('RGB')
# Where the pet's face sits in each photo, as a fraction of width and height.
POUCH = {'red': (0.50, 0.42), 'green': (0.50, 0.43)}


def font(weight, size):
	return ImageFont.truetype(FONT.format(weight), size)


def centred(draw, y, text, f, fill, width):
	w = draw.textlength(text, font=f)
	draw.text(((width - w) / 2, y), text, font=f, fill=fill)


def pill(draw, cx, y, text, f, fg, bg, pad_x=34, pad_y=16):
	w = draw.textlength(text, font=f)
	box = f.getbbox(text)
	h = box[3] - box[1]
	x0, x1 = cx - w / 2 - pad_x, cx + w / 2 + pad_x
	draw.rounded_rectangle((x0, y, x1, y + h + pad_y * 2), radius=(h + pad_y * 2) / 2, fill=bg)
	draw.text((cx - w / 2, y + pad_y - box[1]), text, font=f, fill=fg)
	return y + h + pad_y * 2


def zoomed(photo, focus, zoom, size):
	"""Crop `photo` to `size`'s aspect around `focus`, `zoom` times closer."""
	W, H = photo.size
	tw, th = size
	scale = max(tw / W, th / H) * zoom
	cw, ch = tw / scale, th / scale
	fx, fy = focus[0] * W, focus[1] * H
	x0 = min(max(fx - cw / 2, 0), W - cw)
	y0 = min(max(fy - ch / 2, 0), H - ch)
	return photo.resize(size, Image.LANCZOS, box=(x0, y0, x0 + cw, y0 + ch))


# --- the reel: 1080x1920, 12 s, four 3-second scenes --------------------------
# Reels and Stories cover roughly the top 220 px and the bottom third with
# their own UI, so headlines sit in the band just under the top, and the pet
# in the pouch sits above the caption area.
W, H = 1080, 1920
FPS = 30
SCENE = 3.0
FADE = 0.4
PHOTO_Y, PHOTO_H = 560, 1000


def headline(img, lines, top=250):
	d = ImageDraw.Draw(img)
	f = font('ExtraBold', 78)
	y = top
	for line in lines:
		centred(d, y, line, f, GREEN, W)
		y += 96


def scene_photo(photo, focus, z0, z1, lines):
	def frame(t):
		img = Image.new('RGB', (W, H), CREAM)
		z = z0 + (z1 - z0) * (t / SCENE)
		img.paste(zoomed(photo, focus, z, (W, PHOTO_H)), (0, PHOTO_Y))
		headline(img, lines)
		return img
	return frame


def scene_both(t):
	img = Image.new('RGB', (W, H), CREAM)
	half = (W // 2 - 6, PHOTO_H)
	z = 1.0 + 0.05 * (t / SCENE)
	img.paste(zoomed(RED_SANTA, POUCH['red'], z, half), (0, PHOTO_Y))
	img.paste(zoomed(GREEN_STOCKING, POUCH['green'], z, half), (W // 2 + 6, PHOTO_Y))
	headline(img, ['2 Christmas designs', 'Sizes S – XL'])
	d = ImageDraw.Draw(img)
	f = font('Bold', 40)
	pill(d, W // 4, PHOTO_Y + 30, 'Santa Red', f, CREAM, RED)
	pill(d, 3 * W // 4, PHOTO_Y + 30, 'Stocking Green', f, CREAM, GREEN)
	return img


def end_card(_t=0):
	img = Image.new('RGB', (W, H), GREEN)
	d = ImageDraw.Draw(img)
	thumb = (300, 300)
	for i, (photo, key) in enumerate(((RED_SANTA, 'red'), (GREEN_STOCKING, 'green'))):
		t = zoomed(photo, POUCH[key], 1.9, thumb)
		mask = Image.new('L', thumb, 0)
		ImageDraw.Draw(mask).ellipse((0, 0, *thumb), fill=255)
		x = W // 2 - 320 + i * 340
		d.ellipse((x - 8, 258, x + thumb[0] + 8, 274 + thumb[1]), fill=CREAM)
		img.paste(t, (x, 266), mask)
	y = 640
	centred(d, y, 'Christmas', font('ExtraBold', 96), CREAM, W)
	centred(d, y + 110, 'Pouch Hoodie', font('ExtraBold', 96), CREAM, W)
	centred(d, y + 250, '$54.99', font('ExtraBold', 120), GOLD, W)
	centred(d, y + 420, 'Free shipping · 30-day returns', font('SemiBold', 50), CREAM, W)
	pill(d, W // 2, y + 520, 'Order by Dec 7 for Christmas', font('Bold', 50), GREEN, GOLD, 40, 22)
	centred(d, y + 680, 'chillmypet', font('Bold', 44), CREAM, W)
	return img


SCENES = [
	scene_photo(RED_SANTA, POUCH['red'], 1.0, 1.08, ['Cat & small dog owners,', 'this one’s for you']),
	scene_photo(GREEN_STOCKING, POUCH['green'], 1.25, 1.45, ['Your pet rides in', 'the front pouch']),
	scene_both,
	end_card,
]


def reel():
	out = HERE / 'reel.mp4'
	ff = subprocess.Popen([
		'ffmpeg', '-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24',
		'-s', f'{W}x{H}', '-r', str(FPS), '-i', '-',
		'-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo', '-shortest',
		'-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p',
		'-c:a', 'aac', '-movflags', '+faststart', str(out),
	], stdin=subprocess.PIPE)
	per = int(SCENE * FPS)
	fade = int(FADE * FPS)
	for i, scene in enumerate(SCENES):
		for n in range(per):
			frame = scene(n / FPS)
			# Cross-fade the last frames of each scene into the next one's start.
			if i + 1 < len(SCENES) and n >= per - fade:
				a = (n - (per - fade) + 1) / (fade + 1)
				frame = Image.blend(frame, SCENES[i + 1](0), a)
			ff.stdin.write(frame.tobytes())
	ff.stdin.close()
	ff.wait()
	return out


# --- the stills ---------------------------------------------------------------

def square():
	S = 1080
	img = Image.new('RGB', (S, S), CREAM)
	d = ImageDraw.Draw(img)
	centred(d, 44, 'Christmas Pouch Hoodie', font('ExtraBold', 70), GREEN, S)
	centred(d, 132, 'Your cat or small dog rides in the front', font('SemiBold', 40), INK, S)
	half = (S // 2 - 6, 690)
	img.paste(zoomed(RED_SANTA, POUCH['red'], 1.0, half), (0, 210))
	img.paste(zoomed(GREEN_STOCKING, POUCH['green'], 1.0, half), (S // 2 + 6, 210))
	pill(d, S // 4, 230, 'Santa Red', font('Bold', 36), CREAM, RED)
	pill(d, 3 * S // 4, 230, 'Stocking Green', font('Bold', 36), CREAM, GREEN)
	d.rectangle((0, 900, S, S), fill=GREEN)
	d.text((60, 922), '$54.99', font=font('ExtraBold', 84), fill=GOLD)
	d.text((420, 930), 'Free shipping', font=font('SemiBold', 40), fill=CREAM)
	d.text((420, 985), '30-day returns · S – XL', font=font('SemiBold', 40), fill=CREAM)
	out = HERE / 'square.jpg'
	img.save(out, quality=92)
	return out


def portrait():
	PW, PH = 1080, 1350
	img = Image.new('RGB', (PW, PH), CREAM)
	d = ImageDraw.Draw(img)
	centred(d, 50, 'Cat & small dog owners,', font('ExtraBold', 70), GREEN, PW)
	centred(d, 135, 'this one’s for you', font('ExtraBold', 70), GREEN, PW)
	img.paste(zoomed(RED_SANTA, POUCH['red'], 1.0, (PW, 870)), (0, 250))
	# Call out the pouch: a ring round the pet and a label beside it.
	cx, cy, r = 545, 250 + 395, 155
	d.ellipse((cx - r, cy - r, cx + r, cy + r), outline=GOLD, width=10)
	pill(d, 860, cy - 200, 'Pet pouch', font('Bold', 40), GREEN, GOLD)
	d.rectangle((0, 1120, PW, PH), fill=GREEN)
	centred(d, 1140, '$54.99  ·  Free shipping  ·  30-day returns', font('Bold', 44), CREAM, PW)
	pill(d, PW // 2, 1222, 'Order by Dec 7 for Christmas', font('Bold', 44), GREEN, GOLD, 36, 18)
	out = HERE / 'portrait.jpg'
	img.save(out, quality=92)
	return out


if __name__ == '__main__':
	for f in (square(), portrait(), reel()):
		print(f)
