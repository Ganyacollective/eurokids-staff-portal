from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4
from reportlab.lib.colors import HexColor, white
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.utils import ImageReader
import glob, sys

L='/usr/share/fonts/truetype/liberation2/' if glob.glob('/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf') else '/usr/share/fonts/truetype/liberation/'
pdfmetrics.registerFont(TTFont('R', L+'LiberationSans-Regular.ttf'))
pdfmetrics.registerFont(TTFont('B', L+'LiberationSans-Bold.ttf'))
D='/usr/share/fonts/truetype/dejavu/'
pdfmetrics.registerFont(TTFont('DR', D+'DejaVuSans.ttf')); pdfmetrics.registerFont(TTFont('DB', D+'DejaVuSans-Bold.ttf'))
def money(c,x,y,v,font,size,right=False):
    # the rupee sign comes from DejaVu (Liberation has none); the digits stay in the text face
    t=f'{v:,.0f}'; sym=chr(0x20B9); sf='D'+font; ss=size*0.9
    wn=pdfmetrics.stringWidth(t,font,size); ws=pdfmetrics.stringWidth(sym,sf,ss)+size*0.08
    if right: x=x-wn-ws
    c.setFont(sf,ss); c.drawString(x,y,sym); c.setFont(font,size); c.drawString(x+ws,y,t)

BLUE=HexColor('#21409A'); INK=HexColor('#1A202C'); MUTE=HexColor('#5B6475')
LINE=HexColor('#D9DEE8'); TINT=HexColor('#F3F5FA')
W,H=A4; M=54
LOGO=ImageReader('/sessions/gifted-affectionate-thompson/mnt/Eurokids/payroll-app/public/brand/jmd-enclave-mark@2x.png')

# The revised 2027-28 card. Registration, term fee and uniform as on both
# sheets; tuition is the revised figure, split one third / two thirds
# across the terms exactly as the earlier sheet split it.
CLASSES=[('Play Group','',9600,7600,42300,0,59500),
         ('Nursery','',10430,7600,53670,0,71700),
         ('Euro Junior','Junior KG',11900,8600,59180,2320,82000),
         ('Euro Senior','Senior KG',12100,8600,62980,2320,86000)]
def rows(c):
    name,alt,reg,term,tui,uni,total=c
    t1=round(tui/3); t2=tui-t1
    r=[('Welcome Kit',reg,0),('Term Fee',term//2,term//2),('Tuition Fee',t1,t2)]
    if uni: r.append(('Uniform Fee',uni,0))
    a=sum(x[1] for x in r); b=sum(x[2] for x in r)
    assert a+b==total,(name,a,b,total)
    return r,a,b
n=lambda v: f'{v:,.0f}' if v else '–'

def header(c, title_right=True):
    lw=150; lh=lw*409/900
    c.drawImage(LOGO, M, H-M-lh+8, lw, lh, mask='auto')
    c.setFillColor(INK); c.setFont('B',20); c.drawRightString(W-M, H-M-18, 'Fee Structure')
    c.setFillColor(MUTE); c.setFont('R',11.5); c.drawRightString(W-M, H-M-36, 'Academic Year 2027–28')
    c.setStrokeColor(LINE); c.setLineWidth(1); c.line(M, H-M-lh-6, W-M, H-M-lh-6)
    return H-M-lh-6
def footer(c):
    c.setStrokeColor(LINE); c.line(M, M+26, W-M, M+26)
    c.setFillColor(INK); c.setFont('B',9.5); c.drawString(M, M+10, 'EuroKids JMD Enclave')
    c.setFillColor(MUTE); c.setFont('R',9.5)
    c.drawRightString(W-M, M+10, '022 696 22 686   ·   admin@eurokidsjmdenclave.org')

def table(c, y, cls, rowh=30, fs=11.5, headh=34):
    r,a,b=rows(cls); x0=M; x1=W-M; cols=[x0+ (x1-x0)*f for f in (0.46,0.64,0.82,1.0)]
    c.setFillColor(BLUE); c.roundRect(x0,y-headh,x1-x0,headh,5,stroke=0,fill=1)
    c.rect(x0,y-headh,x1-x0,6,stroke=0,fill=1)
    c.setFillColor(white); c.setFont('B',fs-1.5)
    c.drawString(x0+14,y-headh/2-3.5,'Fees')
    for lab,x in zip(('Term 1','Term 2','Total'),cols[1:]): c.drawRightString(x-14,y-headh/2-3.5,lab)
    y-=headh
    for i,(lab,p,q) in enumerate(r):
        if i%2: c.setFillColor(TINT); c.rect(x0,y-rowh,x1-x0,rowh,stroke=0,fill=1)
        c.setFillColor(INK); c.setFont('R',fs); c.drawString(x0+14,y-rowh/2-4,lab)
        for v,x in zip((p,q,p+q),cols[1:]):
            c.setFillColor(INK if v else MUTE); c.drawRightString(x-14,y-rowh/2-4,n(v))
        y-=rowh
    c.setStrokeColor(INK); c.setLineWidth(1.2); c.line(x0,y,x1,y)
    th=rowh+4
    c.setFillColor(INK); c.setFont('B',fs+0.5); c.drawString(x0+14,y-th/2-4,'Total Amount')
    for v,x in zip((a,b,a+b),cols[1:]): money(c,x-14,y-th/2-4,v,'B',fs+0.5,True)
    y-=th
    c.setStrokeColor(LINE); c.setLineWidth(1); c.line(x0,y,x1,y)
    return y,a,b

def class_page(c, cls):
    name,alt=cls[0],cls[1]
    y=header(c)-46
    c.setFillColor(BLUE); c.setFont('B',34); c.drawString(M,y,name)
    if alt:
        w=pdfmetrics.stringWidth(name,'B',34); c.setFillColor(MUTE); c.setFont('R',15); c.drawString(M+w+12,y,alt)
    y-=24
    c.setFillColor(MUTE); c.setFont('R',11.5); c.drawString(M,y,'Fees for the full academic year, payable in two instalments.')
    y-=30
    y,a,b=table(c,y,cls)
    # the two instalments, as the two things a parent actually pays
    y-=34; gap=16; bw=(W-2*M-gap)/2; bh=104
    for i,(lab,sub,v) in enumerate((('First instalment','Term 1',a),('Second instalment','Term 2',b))):
        x=M+i*(bw+gap)
        c.setFillColor(TINT); c.setStrokeColor(LINE); c.roundRect(x,y-bh,bw,bh,8,stroke=1,fill=1)
        c.setFillColor(MUTE); c.setFont('B',9); c.drawString(x+18,y-26,sub.upper())
        c.setFillColor(INK); c.setFont('R',12.5); c.drawString(x+18,y-46,lab)
        c.setFillColor(BLUE); money(c,x+18,y-82,v,'B',28)
    y-=bh+30
    c.setFillColor(BLUE); c.roundRect(M,y-56,W-2*M,56,8,stroke=0,fill=1)
    c.setFillColor(white); c.setFont('R',12.5); c.drawString(M+18,y-33,'Total for the year')
    money(c,W-M-18,y-37,a+b,'B',24,True)
    footer(c); c.showPage()

def all_page(c):
    y=header(c)-20
    for cls in CLASSES:
        name,alt=cls[0],cls[1]
        c.setFillColor(BLUE); c.setFont('B',14); c.drawString(M,y-12,name)
        if alt:
            w=pdfmetrics.stringWidth(name,'B',14); c.setFillColor(MUTE); c.setFont('R',10); c.drawString(M+w+8,y-12,alt)
        y,_,_=table(c,y-22,cls,rowh=19,fs=9.5,headh=22)
        y-=18
    footer(c); c.showPage()

out=sys.argv[1]
c=canvas.Canvas(out,pagesize=A4); c.setTitle('EuroKids JMD Enclave — Fee Structure 2027–28'); c.setAuthor('EuroKids JMD Enclave')
for cls in CLASSES: class_page(c,cls)
all_page(c); c.save()
for cls in CLASSES:
    r,a,b=rows(cls); print(cls[0],r,a,b,a+b)
