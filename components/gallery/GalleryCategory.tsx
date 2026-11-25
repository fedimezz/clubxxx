import Image from "next/image";
import type { CSSProperties } from "react";

interface Props {
  title: string;
  description: string;
  images: string[];
  imageKey: string;
  imageStyle: (key: string, index?: number) => CSSProperties;
}

export default function GalleryCategory({
  title,
  description,
  images,
  imageKey,
  imageStyle,
}: Props) {
  return (
    <section className="py-24">
      <div className="mx-auto max-w-7xl px-6">

        <div className="mb-10">
          <h2 className="text-5xl font-bold">
            {title}
          </h2>

          <p className="mt-4 text-gray-500">
            {description}
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {images.map((image, index) => (
            <div
              key={image}
              className="
                group
                overflow-hidden
                rounded-3xl
                shadow-lg
              "
            >
              <div className="relative h-[280px]">
                <Image
                  src={image}
                  alt={title}
                  fill
                  className="
                    object-cover
                    transition
                    duration-700
                    group-hover:scale-110
                  "
                  style={imageStyle(imageKey, index)}
                />
              </div>
            </div>
          ))}
        </div>

      </div>
    </section>
  );
}