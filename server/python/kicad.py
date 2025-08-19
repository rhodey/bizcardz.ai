## adapted from:
## https://gist.github.com/theacodes/2e13e4e05700279734ca4b34df370adb

# deps
import sys, pathlib
import shlex, argparse
import math, numpy
from decimal import Decimal
import pyvips, potracecffi, gdstk

# annoying
pyvips.cache_set_max(0)

# args
parser = argparse.ArgumentParser(add_help=False)
parser.add_argument("input")
parser.add_argument("output")

# args
parser.add_argument("--width", default="3.5")
parser.add_argument("--height", default="2.0")
parser.add_argument("--layer", default="F.Mask")
parser.add_argument("--front", action="store_true")
parser.add_argument("--back", action="store_true")
parser.set_defaults(front=True)
parser.set_defaults(back=False)

SCALE_LONG = 2 * 1024

def parse_args():
    args = parser.parse_args()
    args.width = float(args.width)
    args.height = float(args.height)

    if (args.back):
        args.front = False

    return args

def load_image(args):
    # load
    image = pyvips.Image.new_from_file(args.input)

    # remove alpha
    if image.hasalpha():
        image = image.flatten(background=[255])

    # greyscale
    image = image.colourspace("b-w")

    # flip
    if (args.back):
        image = image.flip(pyvips.enums.Direction.HORIZONTAL)

    sc_width = 1.0
    sc_height = 1.0
    if args.width > args.height:
        ar = args.width / args.height
        sc_width = SCALE_LONG
        sc_height = sc_width * (1 / ar)
        sc_width = sc_width / image.width
        sc_height = sc_height / image.height
    else:
        ar = args.height / args.width
        sc_height = SCALE_LONG
        sc_width = sc_height * (1 / ar)
        sc_height = sc_height / image.height
        sc_width = sc_width / image.width

    image = image.affine((sc_width, 0, 0, sc_height))
    long = args.width if args.width > args.height else args.height
    args.ppi = SCALE_LONG / long
    args.ppmm = Decimal(25.4 / args.ppi).quantize(Decimal("1.0000"))
    args.ppmm = float(args.ppmm)
    return image

# alias for a point
point = tuple[float, float]

def bezier_to_points(p1: point, p2: point, p3: point, p4: point, segments: int = 10):
    for t in numpy.linspace(0, 1, num=segments):
        x = (
            p1[0] * math.pow(1 - t, 3)
            + 3 * p2[0] * math.pow(1 - t, 2) * t
            + 3 * p3[0] * (1 - t) * math.pow(t, 2)
            + p4[0] * math.pow(t, 3)
        )
        y = (
            p1[1] * math.pow(1 - t, 3)
            + 3 * p2[1] * math.pow(1 - t, 2) * t
            + 3 * p3[1] * (1 - t) * math.pow(t, 2)
            + p4[1] * math.pow(t, 3)
        )
        yield (x, y)

def trace_polygons(image, args):
    bitmap = image.numpy()
    trace_result = potracecffi.trace(bitmap, alphamax=0.5, turdsize=25)
    polygons_and_holes: list[list[gdstk.Polygon]] = []

    # Go through each path and pull out polygons and holes
    for path in potracecffi.iter_paths(trace_result):

        # Go through each segment in the path and put together a list of points
        # that make up the polygon/hole.
        points = [potracecffi.curve_start_point(path.curve)]
        for segment in potracecffi.iter_curve(path.curve):

            # Corner segments are simple lines from c1 to c2
            if segment.tag == potracecffi.CORNER:
                points.append(segment.c1)
                points.append(segment.c2)

            # Curveto segments are cubic bezier curves
            if segment.tag == potracecffi.CURVETO:
                points.extend(
                    list(
                        bezier_to_points(
                            points[-1],
                            segment.c0,
                            segment.c1,
                            segment.c2,
                        )
                    )
                )

        polygon = gdstk.Polygon(points)

        # Check the sign of the path, + means its a polygon and - means its a hole.
        if path.sign == ord("+"):
            # If it's a polygon, insert a new list with the polygon.
            polygons_and_holes.append([polygon])
        else:
            # If it's a hole, append it to the last polygon's list
            polygons_and_holes[-1].append(polygon)

    # Now take the list of polygons and holes and simplify them into a final list
    # of simple polygons using boolean operations.
    polygons: list[gdstk.Polygon] = []

    for polygon, *holes in polygons_and_holes:
        # This polygon has no holes, so it's ready to go
        if not holes:
            polygons.append(polygon)
            continue

        # Use boolean "not" to subtract all of the holes from the polygon.
        results: list[gdstk.Polygon] = gdstk.boolean(polygon, holes, "not")

        # Gdstk will return more than one polygon if the result can not be
        # represented with a simple polygon, so extend the list with the results.
        polygons.extend(results)

    return polygons

def fp_poly(points: list[point], args) -> str:
    points_mm = (
        (x * args.ppmm, y * args.ppmm) for (x, y) in points
    )
    points_sexpr = "\n".join((f"(xy {x:.4f} {y:.4f})" for (x, y) in points_mm))
    return f"""(fp_poly
        (pts {points_sexpr})
        (layer "{args.layer}")
        (width 0)
        (fill solid)
        (tstamp "7a7d51f6-24ac-11ed-8354-7a0c86e76eee")
    )"""

def fp_write(polygons, args):
    poly_sexprs = "\n".join(fp_poly(polygon.points, args) for polygon in polygons)
    footprint = f"""(footprint "bzFootprint"
        (layer "{args.layer}")
        (at 0 0)
        (attr board_only exclude_from_pos_files exclude_from_bom)
        (tstamp "7a7d5548-24ac-11ed-8354-7a0c86e76eee")
        (tedit "7a7d5552-24ac-11ed-8354-7a0c86e76eee")
        {poly_sexprs}
    )"""
    pathlib.Path(args.output).write_text(footprint)

try:
    args = parse_args()
    image = load_image(args)
    polygons = trace_polygons(image, args)
    fp_write(polygons, args)
    print("ok", flush=True)
    exit(0)
except Exception as err:
    print(f"{err}", file=sys.stderr, flush=True)
    exit(1)
